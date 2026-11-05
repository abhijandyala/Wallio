/**
 * Browser action policy, enforced in code and independent of the model (PRD §14).
 *
 * The runner's egress proxy enforces hosts at the network layer. This layer adds
 * path prefixes, the action vocabulary, step/screenshot/time budgets and the
 * approval rule, and refuses anything off-policy before it is sent to the runner.
 */
import { runner as rc } from "@wallio/contracts";

const RUNNER_LIMITS = rc.RUNNER_LIMITS;

export interface PolicySpec {
  /** host → allowed path prefixes ("/" allows the whole host). Hosts are exact, lower-case. */
  allowed: Record<string, string[]>;
  maxActions: number;
  maxScreenshots: number;
  deadlineAt: Date;
  /** Stop issuing actions this long before the deadline, so cleanup has time. */
  marginMs?: number;
}

export interface PolicyState {
  actionsUsed: number;
  screenshotsUsed: number;
  /** Elements from the most recent inspect on the current page. */
  elements: rc.Observation["elements"];
}

export type Decision = { ok: true; needsApproval?: false } | { ok: false; reason: string; needsApproval?: boolean };

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f:]+\]?)$/i;
const EXTERNAL_EFFECT = /\b(submit|buy|purchase|subscribe|sign ?up|register|checkout|pay|order|delete|remove|send|confirm|upgrade|start (free )?trial)\b/i;

export function hostAllowed(spec: PolicySpec, rawUrl: string): Decision {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "only https pages are allowed" };
  if (u.username || u.password) return { ok: false, reason: "URLs with credentials are not allowed" };
  if (u.port && u.port !== "443") return { ok: false, reason: "non-standard ports are not allowed" };
  const host = u.hostname.toLowerCase();
  if (IP_LITERAL.test(host) || host === "localhost") return { ok: false, reason: "IP addresses and localhost are not allowed" };
  const prefixes = spec.allowed[host];
  if (!prefixes) return { ok: false, reason: `${host} is not on the allowed list` };
  if (!prefixes.some((p) => p === "/" || u.pathname === p || u.pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || u.pathname.startsWith(p))) {
    return { ok: false, reason: `${u.pathname} is outside the allowed pages on ${host}` };
  }
  return { ok: true };
}

export function checkAction(spec: PolicySpec, state: PolicyState, action: rc.RunnerAction, now = new Date()): Decision {
  const limitActions = Math.min(spec.maxActions, RUNNER_LIMITS.maxActions);
  if (state.actionsUsed >= limitActions) return { ok: false, reason: `step budget of ${limitActions} actions is used up` };
  if (now.getTime() >= spec.deadlineAt.getTime() - (spec.marginMs ?? 10_000)) return { ok: false, reason: "too close to the run deadline" };

  switch (action.type) {
    case "navigate":
      return hostAllowed(spec, action.url);
    case "screenshot":
      return state.screenshotsUsed >= Math.min(spec.maxScreenshots, RUNNER_LIMITS.maxScreenshots)
        ? { ok: false, reason: "screenshot budget is used up" }
        : { ok: true };
    case "inspect":
    case "scroll":
    case "finish":
      return { ok: true };
    case "click": {
      const el = state.elements?.find((e) => e.ref === action.elementRef);
      if (!el) return { ok: false, reason: "element was not in the last inspection" };
      if (el.targetHost && !spec.allowed[el.targetHost.toLowerCase()]) return { ok: false, reason: `the element leads to ${el.targetHost}, which is not allowed` };
      if (el.href) {
        try {
          const target = new URL(el.href, "https://placeholder.invalid/");
          if (target.hostname !== "placeholder.invalid" && !hostAllowed(spec, target.toString()).ok) return { ok: false, reason: "the link leads outside the allowed pages" };
        } catch { /* relative or malformed: host check above covers targetHost */ }
      }
      const effect = el.inputType === "submit" || EXTERNAL_EFFECT.test(`${el.name} ${el.text}`);
      if (effect && !action.approvalToken) return { ok: false, needsApproval: true, reason: "this would cause an external effect and needs your approval" };
      return { ok: true };
    }
    case "fill":
      // Research never fills forms. Approved form filling arrives with the approval gate (P7).
      return { ok: false, needsApproval: true, reason: "filling forms needs an approved action" };
  }
}

/** True if the page the runner ended up on (after redirects) is still inside policy. */
export function observationInPolicy(spec: PolicySpec, obs: rc.Observation): Decision {
  for (const u of [...obs.redirectChain, obs.url]) {
    const d = hostAllowed(spec, u);
    if (!d.ok) return { ok: false, reason: `the page redirected outside the allowed area (${d.reason})` };
  }
  return { ok: true };
}
