#!/usr/bin/env node
/**
 * Wallio connector: an MCP server (stdio) that lets an AI assistant read a person's Wallio wallet.
 *
 * Read-only, except start_comparison, which starts one research run on the person's run quota.
 * Nothing here can approve an action, submit a form, record a decision or spend money: approvals
 * happen only in the Wallio app, by the person.
 *
 * Env:
 *   WALLIO_URL          API origin (default https://149-28-76-16.sslip.io). https only, except localhost.
 *   WALLIO_SESSION      Optional existing wallio_sid value, to share a browser's guest wallet.
 *   WALLIO_SESSION_FILE Optional path for the persisted session (default ~/.config/wallio-mcp/session.json).
 *
 * stdout carries the protocol. Diagnostics go to stderr and never include the session value.
 */
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type {
  Accepted,
  ApiError,
  CatalogTool,
  DecisionsOverview,
  InventoryResponse,
  Price,
  ProfileVersion,
  Recommendation,
  Run,
} from "./contract.ts";

const VERSION = "0.1.0";
const DEFAULT_URL = "https://149-28-76-16.sslip.io";
const COOKIE = "wallio_sid";

// ───────────────────────── Config ─────────────────────────

function log(msg: string): void {
  process.stderr.write(`[wallio-mcp] ${msg}\n`);
}

export function parseWallioUrl(raw: string | undefined): URL {
  const url = new URL(raw?.trim() || DEFAULT_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`WALLIO_URL must use https (http is allowed only for localhost). Got ${url.protocol}//${url.host}.`);
  }
  return url;
}

const base = (() => {
  try {
    return parseWallioUrl(process.env.WALLIO_URL);
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
const origin = base.origin;
const apiRoot = `${origin}${base.pathname.replace(/\/+$/, "")}/api`;

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg && xdg.startsWith("/") ? xdg : join(homedir(), ".config"), "wallio-mcp");
}
const sessionFile = process.env.WALLIO_SESSION_FILE || join(configDir(), "session.json");
const envSession = process.env.WALLIO_SESSION?.trim() || null;

/** One guest session per API origin, so a local cookie is never sent to production or the reverse. */
type SessionStore = { sessions: Record<string, string> };

function readStore(): SessionStore {
  try {
    const parsed = JSON.parse(readFileSync(sessionFile, "utf8")) as Partial<SessionStore>;
    return { sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {} };
  } catch {
    return { sessions: {} };
  }
}

function persistSession(sid: string): void {
  try {
    const store = readStore();
    store.sessions[origin] = sid;
    mkdirSync(dirname(sessionFile), { recursive: true, mode: 0o700 });
    writeFileSync(sessionFile, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
    chmodSync(sessionFile, 0o600);
  } catch (e) {
    log(`Could not save the Wallio session to ${sessionFile}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

let session: string | null = envSession ?? readStore().sessions[origin] ?? null;

// ───────────────────────── API client ─────────────────────────

export class ApiFailure extends Error {
  readonly status: number;
  readonly error: ApiError;
  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.error = error;
  }
}

function captureCookie(res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const m = line.match(/^\s*wallio_sid=([^;]*)/);
    if (!m || !m[1] || m[1] === session) continue;
    const replaced = session !== null;
    session = m[1];
    if (envSession) {
      // The configured session was replaced by the API (expired or unknown). Use the new one for
      // this process only; the person's configured value is theirs to change.
      log("The API issued a new guest session; WALLIO_SESSION was not accepted. Using a new guest wallet for this process.");
    } else {
      persistSession(session);
      log(replaced ? "The API issued a new guest session (the saved one expired). Saved it." : "Started a new guest wallet and saved its session.");
    }
  }
}

async function call<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.json !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { accept: "application/json", "user-agent": `wallio-mcp/${VERSION}` };
  if (session) headers.cookie = `${COOKIE}=${session}`;
  if (method !== "GET") headers.origin = origin; // the API refuses non-GET requests from other origins
  if (init.json !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${apiRoot}${path}`, {
      method,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "could not connect";
    throw new ApiFailure(0, { code: "unreachable", message: `Can't reach the Wallio API at ${origin} (${why}).` });
  }
  captureCookie(res);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "message" in body
        ? (body as ApiError)
        : { code: "internal", message: `The Wallio API answered ${res.status}.` };
    throw new ApiFailure(res.status, err);
  }
  return body as T;
}

const api = {
  catalog: () => call<CatalogTool[]>("/catalog"),
  profile: () => call<ProfileVersion>("/profile"),
  inventory: () => call<InventoryResponse>("/inventory"),
  decisions: () => call<DecisionsOverview>("/decisions"),
  startComparison: (body: unknown) => call<Accepted>("/comparisons", { json: body }),
  run: (id: string) => call<Run>(`/runs/${encodeURIComponent(id)}`),
  recommendation: (id: string) => call<Recommendation>(`/recommendations/${encodeURIComponent(id)}`),
};

// ───────────────────────── Formatting ─────────────────────────

function money(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

/** Never "$0" for a price nobody knows. */
function priceText(p: Price): string {
  return p.known ? money(p.amountMinor, p.currency) : `Unknown (${p.reason})`;
}

function errorText(err: ApiError): string {
  let msg = err.message || "Something went wrong.";
  const issues = err.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    const lines = issues
      .slice(0, 8)
      .map((i) => (i && typeof i === "object" ? `${(i as { path?: string }).path ?? "?"}: ${(i as { message?: string }).message ?? ""}` : String(i)));
    msg += ` (${lines.join("; ")})`;
  }
  if (err.code === "rate_limited" || err.code === "quota_exceeded") {
    const wait = Number(err.details?.retryAfterSeconds);
    if (Number.isFinite(wait) && wait > 0) msg += ` Retry after about ${Math.ceil(wait)} s.`;
  }
  return `${msg} [${err.code}${err.correlationId ? `, ${err.correlationId}` : ""}]`;
}

function ok(text: string, structured: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

/** Every API failure becomes an MCP tool error carrying the API's own message. */
async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    const err: ApiError =
      e instanceof ApiFailure ? e.error : { code: "internal", message: e instanceof Error ? e.message : String(e) };
    return { isError: true, content: [{ type: "text", text: errorText(err) }], structuredContent: { error: err } };
  }
}

const TERMINAL_OUTCOMES = new Set(["succeeded", "partial", "failed", "timed_out", "cancelled"]);

// ───────────────────────── Server ─────────────────────────

const INSTRUCTIONS = `Wallio keeps a person's AI-tool wallet: the subscriptions they pay for, their working profile, and evidence-backed recommendations.
These tools read that wallet. The only tool that changes anything is start_comparison, which starts one research run and uses the person's daily run quota; ask before calling it.
No tool here can approve an action, submit a form, record a decision, cancel a subscription or spend money. Approvals and decisions happen only in the Wallio app, by the person. If a run is waiting for approval, tell the person to open Wallio to review it.
Prices: when a price is unknown, say it is unknown; never treat it as zero. Totals come from the server's summary; do not add prices up yourself.
Cite recommendation statements with their evidence ids.`;

export function createServer(): McpServer {
  const server = new McpServer({ name: "wallio", version: VERSION }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "get_wallet",
    {
      title: "Get wallet",
      description:
        "The person's AI subscriptions: tool, plan, price (Unknown when Wallio doesn't know it, never $0), billing cadence, seats, renewal date, plus the server-computed summary (known monthly equivalent, count of unknown prices, upcoming renewals).",
      annotations: readOnly,
    },
    () =>
      guarded(async () => {
        const inv = await api.inventory();
        const names = new Map(inv.tools.map((t) => [t.id, t]));
        if (inv.subscriptions.some((s) => !names.has(s.toolId))) {
          for (const t of await api.catalog()) names.set(t.id, t);
        }
        const rows = inv.subscriptions.map((s) => ({
          id: s.id,
          toolId: s.toolId,
          toolName: names.get(s.toolId)?.name ?? s.toolId,
          provider: names.get(s.toolId)?.provider ?? null,
          plan: s.plan,
          price: s.price,
          priceText: priceText(s.price),
          cadence: s.cadence,
          seats: s.seats,
          renewalDate: s.renewalDate,
          status: s.status,
          source: s.source,
        }));
        const sm = inv.summary;
        const known =
          sm.knownMonthlyEquivalentMinor === null ? "unknown (no known prices)" : `${money(sm.knownMonthlyEquivalentMinor, sm.currency)}/month`;
        const lines = [
          `${rows.length} subscription${rows.length === 1 ? "" : "s"}:`,
          ...rows.map(
            (r) =>
              `- ${r.toolName}: ${r.plan}, ${r.priceText}, ${r.cadence}${r.seats > 1 ? `, ${r.seats} seats` : ""}${r.renewalDate ? `, renews ${r.renewalDate}` : ""}${r.status !== "active" ? ` [${r.status}]` : ""}`,
          ),
          `Known monthly equivalent (server): ${known}.`,
          `Subscriptions with unknown price: ${sm.unknownPriceCount}${sm.unknownPriceCount ? " (not included in the total)" : ""}.`,
        ];
        if (sm.upcomingRenewals.length) {
          lines.push(
            `Upcoming renewals: ${sm.upcomingRenewals
              .map((u) => `${rows.find((r) => r.id === u.subscriptionId)?.toolName ?? u.subscriptionId} on ${u.renewalDate} (${money(u.amount.amountMinor, u.amount.currency)})`)
              .join("; ")}.`,
          );
        }
        return ok(lines.join("\n"), { subscriptions: rows, summary: sm });
      }),
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description:
        "The person's current Wallio profile: role, workflows, budget, deployment/data/switching preferences, required integrations, and attributes marked as stated by the person or inferred by Wallio (with source and confidence).",
      annotations: readOnly,
    },
    () =>
      guarded(async () => {
        const p = await api.profile();
        const attr = (a: ProfileVersion["attributes"][number]) => {
          const v = Array.isArray(a.value) ? a.value.join(", ") : String(a.value);
          return a.origin === "user_stated"
            ? `- ${a.key}: ${v} (stated by the person)`
            : `- ${a.key}: ${v} (inferred from ${a.source ?? "unknown source"}, ${a.confidence ?? "unknown"} confidence${a.confirmed ? ", confirmed" : ", not confirmed"})`;
        };
        const text = [
          `Profile version ${p.version} (${p.id}).`,
          `Role: ${p.primaryRole}.`,
          `Workflows: ${p.workflows.map((w) => `${w.name} [${w.id}, priority ${w.priority}]: ${w.description}`).join("; ") || "none"}.`,
          `Budget: up to ${money(p.budget.maxMonthlyMinor, p.budget.currency)}/month.`,
          `Deployment: ${p.deploymentPreference}. Data sensitivity: ${p.dataSensitivity}. Willingness to switch: ${p.willingnessToSwitch}.`,
          `Required integrations: ${p.requiredIntegrations.join(", ") || "none"}.`,
          `Attributes:`,
          ...(p.attributes.length ? p.attributes.map(attr) : ["- none"]),
        ].join("\n");
        return ok(text, { profile: p });
      }),
  );

  server.registerTool(
    "list_decisions",
    {
      title: "List decisions",
      description:
        "Wallio's decision queue and history: pending approvals (which only the person can approve, in the Wallio app), open recommendations, deferred items and past decisions with their outcomes.",
      annotations: readOnly,
    },
    () =>
      guarded(async () => {
        const d = await api.decisions();
        const lines: string[] = [];
        lines.push(`Pending approvals: ${d.approvals.length}${d.approvals.length ? " (the person must review these in the Wallio app)" : ""}.`);
        for (const a of d.approvals) lines.push(`- ${a.consequence} [${a.id}, ${a.status}, expires ${a.expiresAt}]`);
        lines.push(`Open recommendations: ${d.recommendations.length}.`);
        for (const r of d.recommendations) lines.push(`- ${r.headline} (action: ${r.action}, confidence ${r.confidence}) [${r.id}]`);
        lines.push(`Deferred: ${d.deferred.length}.`);
        for (const x of d.deferred) lines.push(`- ${x.headline} until ${x.until} [${x.recommendationId}]`);
        lines.push(`History: ${d.history.length}.`);
        for (const h of d.history) {
          const saving = h.estimatedAnnualSavingMinor === null ? "" : `, estimated ${money(h.estimatedAnnualSavingMinor, "USD")}/year`;
          lines.push(`- ${h.decidedAt.slice(0, 10)} ${h.choice}: ${h.headline}${h.result ? ` (result: ${h.result})` : ""}${saving} [${h.id}]`);
        }
        return ok(lines.join("\n"), { ...d });
      }),
  );

  server.registerTool(
    "search_catalog",
    {
      title: "Search catalog",
      description: "Search Wallio's catalog of AI tools by name, provider, category or id. Omit the query to list everything.",
      inputSchema: { query: z.string().max(200).optional().describe("Case-insensitive text to match, e.g. 'cursor' or 'anthropic'.") },
      annotations: readOnly,
    },
    ({ query }) =>
      guarded(async () => {
        const all = await api.catalog();
        const q = query?.trim().toLowerCase();
        const tools = q
          ? all.filter((t) => [t.id, t.name, t.provider, t.category].some((f) => f?.toLowerCase().includes(q)))
          : all;
        const text = tools.length
          ? [`${tools.length} tool${tools.length === 1 ? "" : "s"}${q ? ` matching "${query}"` : ""}:`, ...tools.map((t) => `- ${t.name} (${t.provider}, ${t.category}) [${t.id}] ${t.homepageUrl}`)].join("\n")
          : `No catalog tools match "${query}".`;
        return ok(text, { tools: tools.map(({ id, name, provider, category, homepageUrl, pricingUrl }) => ({ id, name, provider, category, homepageUrl, pricingUrl })) });
      }),
  );

  server.registerTool(
    "start_comparison",
    {
      title: "Start comparison",
      description:
        "Start a Wallio research run comparing the person's GitHub Copilot against Zed on their debugging workflow (wf_debugging, task task_js_offbyone_v1, spend cap 50 cents). This uses one of the person's daily runs from their run quota, so confirm with them first. Returns a runId; follow it with get_run. It never approves, buys or submits anything.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    () =>
      guarded(async () => {
        const profile = await api.profile();
        try {
          const acc = await api.startComparison({
            idempotencyKey: randomUUID(),
            profileVersionId: profile.id,
            workflowId: "wf_debugging",
            taskId: "task_js_offbyone_v1",
            incumbentToolId: "tool_copilot",
            candidateToolIds: ["tool_zed"],
            spendCapMinor: 50,
          });
          return ok(`Started comparison run ${acc.runId} (${acc.status}). Call get_run with this runId to follow it; it usually takes under a minute or two.`, {
            runId: acc.runId,
            status: acc.status,
          });
        } catch (e) {
          const active = e instanceof ApiFailure && e.error.code === "conflict" ? e.error.details?.runId : undefined;
          if (typeof active === "string") {
            return ok(`A run is already going (${active}); no new run was started. Call get_run with that runId.`, { runId: active, status: "ALREADY_RUNNING" });
          }
          throw e;
        }
      }),
  );

  server.registerTool(
    "get_run",
    {
      title: "Get run",
      description:
        "Status, stage and outcome of a Wallio run. When the run has a recommendation, also returns its action, headline, confidence and statements with their evidence ids. Poll until finished is true.",
      inputSchema: { runId: z.string().min(1).max(128).describe("The runId returned by start_comparison.") },
      annotations: readOnly,
    },
    ({ runId }) =>
      guarded(async () => {
        const run = await api.run(runId);
        const finished = TERMINAL_OUTCOMES.has(run.outcome);
        const lines = [
          `Run ${run.id}: status ${run.status}, stage ${run.stage}, outcome ${run.outcome}${finished ? " (finished)" : " (still going)"}.`,
          `Coverage: ${run.coverage.evidenceCount} evidence, ${run.coverage.candidatesResearched} researched, ${run.coverage.candidatesTested} tested. Spend: ${money(run.spend.actualMinor, run.spend.currency)} of ${money(run.spend.capMinor, run.spend.currency)} cap.`,
        ];
        if (run.pendingApprovalId) lines.push(`Waiting for the person's approval (${run.pendingApprovalId}). They must review it in the Wallio app; this connector cannot approve.`);
        if (run.error) lines.push(`Error: ${errorText(run.error)}`);
        let recommendation: Recommendation | null = null;
        if (run.recommendationId) {
          recommendation = await api.recommendation(run.recommendationId);
          const r = recommendation;
          lines.push(
            `Recommendation ${r.id}: ${r.headline}`,
            `Action: ${r.action}${r.targetToolId ? ` (target ${r.targetToolId})` : ""}. Confidence: ${r.confidence}.`,
            `Statements:`,
            ...r.statements.map((s) => `- [${s.role}] ${s.text}${s.evidenceIds.length ? ` (evidence: ${s.evidenceIds.join(", ")})` : ""}`),
          );
          if (r.limitations.length) lines.push(`Limitations: ${r.limitations.join(" ")}`);
        }
        return ok(lines.join("\n"), {
          finished,
          run,
          recommendation: recommendation && {
            id: recommendation.id,
            action: recommendation.action,
            targetToolId: recommendation.targetToolId,
            headline: recommendation.headline,
            confidence: recommendation.confidence,
            statements: recommendation.statements,
            limitations: recommendation.limitations,
            evidence: recommendation.evidence.map(({ id, kind, url, candidateToolId, excerpt, limitation }) => ({ id, kind, url, candidateToolId, excerpt, limitation })),
          },
        });
      }),
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  log(`Connected. API ${origin}; session ${envSession ? "from WALLIO_SESSION" : session ? `saved in ${sessionFile}` : "will be created on first call"}.`);
}

main().catch((e) => {
  log(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
