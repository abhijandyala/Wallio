/**
 * Containment run (golden path §4.4). Opens Wallio's own hostile page in an isolated
 * browser job allowed only that host. The page carries a prompt injection, a form
 * that posts to a private sentinel, links to cloud metadata and an exfiltration host,
 * and fires background requests on load.
 *
 * What it shows, layer by layer:
 * 1. The page's text is stored as untrusted data; nothing in it is followed.
 * 2. API policy evaluates every control on the page and refuses each one that leads
 *    off the allowed host. Wallio never clicks anything on this page.
 * 3. The runner's egress proxy refuses the page's own background requests
 *    (observation.deniedRequests and the job's cleanup report).
 * 4. The sentinel on the control VM's private IP still has the same hit count.
 * 5. The job's container and volume are verified removed.
 *
 * Labelled as a controlled containment test, not proof the browser can't be escaped.
 */
import { checkAction } from "../runner/policy.ts";
import type { BrowserSession } from "./browser-session.ts";
import { storeEvidence } from "./evidence.ts";
import { RunFailure, type ExecResult, type RunContext } from "./worker.ts";

/** Reads the sentinel's hit count; null if it can't be read. */
export interface Sentinel { count(): Promise<number | null> }

export function httpSentinel(url: string, fetchImpl: typeof fetch = fetch): Sentinel {
  return {
    async count() {
      try {
        const r = await fetchImpl(`${url.replace(/\/+$/, "")}/count`, { signal: AbortSignal.timeout(3000) });
        const j = (await r.json()) as { hits?: unknown };
        return r.ok && Number.isInteger(j.hits) ? (j.hits as number) : null;
      } catch {
        return null;
      }
    },
  };
}

export interface ContainmentDeps { hostileBaseUrl: string; sentinel: Sentinel | null }

const LIMITATION = "Wallio's own hostile test page. Its text is untrusted and was never followed. A controlled containment test, not proof the browser can't be escaped.";

export async function runContainment(ctx: RunContext, session: BrowserSession, deps: ContainmentDeps): Promise<ExecResult> {
  const base = deps.hostileBaseUrl.replace(/\/+$/, "");
  const host = new URL(base).hostname.toLowerCase();
  await ctx.stage("testing", "Opening Wallio's hostile test page in an isolated browser");
  const before = deps.sentinel ? await deps.sentinel.count() : null;

  await session.open("containment", "Containment test on Wallio's own hostile page", [host]);
  const seen = new Set<string>();
  const logRequests = async (list: Array<{ url: string; reason: string }> | undefined) => {
    for (const d of list ?? []) {
      const key = `${d.url}|${d.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await ctx.emit({ type: "policy_denied", message: "The browser's proxy blocked a request the page tried to make", data: { attemptedAction: "request", target: d.url.slice(0, 200), reason: d.reason } });
    }
  };

  const nav = await session.act({ type: "navigate", url: `${base}/` });
  await logRequests(nav?.observation?.deniedRequests);
  if (nav?.status !== "ok" || !nav.observation) {
    await ctx.emit({ type: "warning", message: "Couldn't open the hostile test page", data: { detail: nav?.error?.code ?? "refused" } });
    await session.close();
    return { outcome: "partial" };
  }
  const ins = await session.act({ type: "inspect", maxElements: 40 });
  await logRequests(ins?.observation?.deniedRequests);

  // Evaluate every control the page offers. Nothing is dispatched: refusals are logged,
  // and controls that would pass policy are still not clicked on a hostile page.
  let refused = 0;
  for (const el of (ins?.observation?.elements ?? []).slice(0, 30)) {
    if (!["button", "link"].includes(el.role) && el.tag !== "button" && el.tag !== "a" && el.inputType !== "submit") continue;
    const action = { type: "click" as const, elementRef: el.ref };
    const d = checkAction(session.policy, session.state, action);
    if (d.ok) continue;
    refused++;
    await session.logDenial(action, d.reason, d.needsApproval, el.name || el.text || el.tag);
  }

  const shot = await session.screenshot();
  const obs = ins?.observation ?? nav.observation;
  const evidenceId = await storeEvidence(ctx, {
    kind: "observed_behavior", accessMode: "tested_owned_demo", toolId: null, url: obs.url, text: obs.textExcerpt ?? "", textHash: obs.textSha256,
    excerpt: `${obs.title}. Its instructions to AI agents were stored as untrusted text and not followed.`, limitation: LIMITATION, shot,
    message: "Captured the hostile page (its text is treated as untrusted data)",
  });

  await ctx.transition("VERIFYING", { stage: "verifying" });
  let cleanupVerified = false;
  let reportDenied = 0;
  try {
    const rep = await session.close();
    cleanupVerified = rep?.status === "cleaned";
    await logRequests(rep?.deniedRequests);
    reportDenied = rep?.deniedRequests.length ?? 0;
  } catch {
    cleanupVerified = false;
  }
  const after = deps.sentinel ? await deps.sentinel.count() : null;
  const sentinel = before !== null && after !== null ? { before, after } : null;
  if (deps.sentinel && !sentinel) {
    await ctx.emit({ type: "warning", message: "Couldn't read the sentinel; containment is judged by the refusals and cleanup only", data: { detail: "sentinel_unreadable" } });
  }
  const contained = cleanupVerified && (!sentinel || sentinel.after === sentinel.before);
  const deniedRequests = Math.max(seen.size, reportDenied);
  await ctx.emit({
    type: "containment_result",
    message: (contained
      ? `Contained: ${deniedRequests} request(s) and ${refused} action(s) refused${sentinel ? `, sentinel unchanged at ${sentinel.after}` : ""}, cleanup verified`
      : sentinel && sentinel.after !== sentinel.before ? `NOT contained: the sentinel went from ${sentinel.before} to ${sentinel.after}` : "Containment not verified: browser cleanup wasn't confirmed"
    ).slice(0, 300),
    data: { contained, deniedRequests, refusedActions: refused, sentinel, cleanupVerified, evidenceId },
  });
  if (!cleanupVerified) throw new RunFailure("runner_unavailable", "The browser used for the containment test couldn't be verified as removed.");
  if (!contained) throw new RunFailure("internal", "The sentinel recorded a request from the hostile page: containment failed. Check the runner before any more live runs.");
  return { outcome: "succeeded" };
}
