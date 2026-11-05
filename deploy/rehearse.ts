/**
 * Deployed rehearsals (PRD §25). Drives the live site over HTTPS the way a visitor
 * would, each rehearsal in a fresh guest workspace:
 *   1. comparison → recommendation (cited statements, evidence)
 *   2. synthetic trial request → approval screen → approve → exactly one action_result
 *   3. containment run → containment_result
 * and appends one row per rehearsal to docs/REHEARSALS.md (plus raw JSON).
 *
 * Usage:
 *   node deploy/rehearse.ts <base-url> [--count N] [--label text] [--expect-failure code]
 * --expect-failure: a degraded rehearsal where the comparison must fail honestly with
 *   that error code (e.g. runner_unavailable) and still end CLEANED.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const [base, ...rest] = process.argv.slice(2);
if (!base?.startsWith("https://")) throw new Error("usage: node deploy/rehearse.ts https://<domain> [--count N] [--label text] [--expect-failure code]");
const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const count = Number(opt("--count") ?? 1);
const label = opt("--label") ?? "standard";
const expectFailure = opt("--expect-failure");

class Guest {
  cookie = "";
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", origin: base, ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async events(runId: string): Promise<any[]> {
    const res = await fetch(`${base}/api/runs/${runId}/events`, { headers: { cookie: this.cookie } });
    const text = await res.text();
    return text.split("\n\n").filter((b) => b.includes("data:")).map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data:"))!.slice(5)));
  }
  async until(runId: string, done: (r: any) => boolean, ms = 200_000): Promise<any> {
    const end = Date.now() + ms;
    for (;;) {
      const r = (await this.call("GET", `/api/runs/${runId}`)).body;
      if (done(r)) return r;
      if (Date.now() > end) throw new Error(`run ${runId} stuck in ${r?.status}`);
      await new Promise((ok) => setTimeout(ok, 500));
    }
  }
}
const finished = (r: any) => r?.status === "CLEANED" || r?.status === "CLEANUP_FAILED";

async function rehearse(n: number) {
  const g = new Guest();
  const row: Record<string, unknown> = { n, label, at: new Date().toISOString() };
  const problems: string[] = [];
  const t0 = Date.now();
  const profile = (await g.call("GET", "/api/profile")).body;
  const start = await g.call("POST", "/api/comparisons", {
    idempotencyKey: crypto.randomUUID(), profileVersionId: profile.id, workflowId: "wf_debugging",
    taskId: "task_js_offbyone_v1", incumbentToolId: "tool_copilot", candidateToolIds: ["tool_zed"],
  });
  if (start.status !== 202) throw new Error(`comparison ${start.status} ${JSON.stringify(start.body)}`);
  const cmp = await g.until(start.body.runId, finished);
  row.comparison = { runId: cmp.id, correlationId: cmp.correlationId, status: cmp.status, outcome: cmp.outcome, seconds: Math.round((Date.now() - t0) / 100) / 10, evidence: cmp.coverage.evidenceCount, error: cmp.error?.code ?? null };
  if (cmp.status !== "CLEANED") problems.push(`comparison ended ${cmp.status}`);

  if (expectFailure) {
    if (cmp.error?.code !== expectFailure) problems.push(`expected ${expectFailure}, got ${cmp.error?.code ?? "no error"}`);
    if (cmp.recommendationId) problems.push("a failed run produced a recommendation");
  } else {
    const rec = (await g.call("GET", `/api/recommendations/${cmp.recommendationId}`)).body;
    const uncited = rec.statements.filter((s: any) => s.role !== "next_step" && !s.evidenceIds.length && !s.userInputRefs.length).length;
    row.recommendation = { action: rec.action, confidence: rec.confidence, statements: rec.statements.length, uncited, evidence: rec.evidence.length };
    if (uncited) problems.push(`${uncited} uncited statement(s)`);

    // Approval-gated synthetic trial request.
    const t1 = Date.now();
    const trial = await g.call("POST", "/api/trial-requests", { idempotencyKey: crypto.randomUUID(), recommendationId: cmp.recommendationId, toolId: "tool_zed" });
    if (trial.status !== 202) throw new Error(`trial ${trial.status} ${JSON.stringify(trial.body)}`);
    const waiting = await g.until(trial.body.runId, (r) => (r.status === "AWAITING_APPROVAL" && r.pendingApprovalId) || finished(r));
    if (waiting.status !== "AWAITING_APPROVAL") problems.push(`trial never asked for approval (${waiting.status})`);
    else {
      const intent = (await g.call("GET", `/api/approvals/${waiting.pendingApprovalId}`)).body;
      const decided = await g.call("POST", `/api/approvals/${intent.id}/decision`, { decision: "approve", intentHash: intent.intentHash });
      const replay = await g.call("POST", `/api/approvals/${intent.id}/decision`, { decision: "approve", intentHash: intent.intentHash });
      if (decided.status !== 200) problems.push(`approve returned ${decided.status}`);
      if (replay.status !== 409) problems.push(`second approve returned ${replay.status}, expected 409`);
    }
    const tr = await g.until(trial.body.runId, finished);
    const results = (await g.events(tr.id)).filter((e) => e.type === "action_result");
    row.trial = { status: tr.status, outcome: tr.outcome, seconds: Math.round((Date.now() - t1) / 100) / 10, actionResults: results.map((e) => e.data.result) };
    if (results.length !== 1) problems.push(`${results.length} action results, expected exactly 1`);

    // Containment.
    const t2 = Date.now();
    const c = await g.call("POST", "/api/containment-runs", { idempotencyKey: crypto.randomUUID() });
    const cr = await g.until(c.body.runId, finished);
    const summary = (await g.events(cr.id)).find((e) => e.type === "containment_result");
    row.containment = { status: cr.status, outcome: cr.outcome, seconds: Math.round((Date.now() - t2) / 100) / 10, ...(summary ? { contained: summary.data.contained, refused: summary.data.refusedActions, denied: summary.data.deniedRequests, sentinel: summary.data.sentinel, cleanupVerified: summary.data.cleanupVerified } : {}) };
    if (!summary?.data.contained) problems.push("containment not confirmed");
  }
  row.health = (await fetch(`${base}/api/health`)).status;
  row.problems = problems;
  row.pass = problems.length === 0;
  return row;
}

const rows = [];
for (let i = 1; i <= count; i++) {
  let row;
  try {
    row = await rehearse(i);
  } catch (e) {
    row = { n: i, label, at: new Date().toISOString(), pass: false, problems: [(e as Error).message.slice(0, 200)] };
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}

mkdirSync("docs/rehearsals", { recursive: true });
writeFileSync(`docs/rehearsals/${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`, JSON.stringify({ base, rows }, null, 2) + "\n");
const md = "docs/REHEARSALS.md";
if (!existsSync(md)) {
  writeFileSync(md, "# Deployed rehearsals\n\nOne row per rehearsal, written by `deploy/rehearse.ts`. Raw results are in `docs/rehearsals/`.\n\n| When (UTC) | Label | Mode | Comparison | Trial (approval) | Containment | Result |\n|---|---|---|---|---|---|---|\n");
}
const mode = (await (await fetch(`${base}/api/health`)).json() as { runMode?: string }).runMode ?? "?";
for (const r of rows as any[]) {
  const c = r.comparison ? `${r.comparison.status}/${r.comparison.outcome}, ${r.comparison.seconds}s, ${r.comparison.evidence} ev${r.comparison.error ? `, ${r.comparison.error}` : ""}` : "–";
  const t = r.trial ? `${r.trial.outcome}, ${r.trial.actionResults.join("+") || "none"}, ${r.trial.seconds}s` : "–";
  const k = r.containment ? `${r.containment.contained ? "contained" : "NOT contained"}, ${r.containment.refused} refused, ${r.containment.seconds}s` : "–";
  appendFileSync(md, `| ${String(r.at).slice(0, 19).replace("T", " ")} | ${r.label} | ${mode} | ${c} | ${t} | ${k} | ${r.pass ? "pass" : `FAIL: ${r.problems.join("; ")}`} |\n`);
}
process.exit(rows.every((r: any) => r.pass) ? 0 : 1);
