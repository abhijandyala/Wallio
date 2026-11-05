/**
 * Owned evaluation harness: the page's own script is executed (in a VM with a
 * minimal DOM shim) to prove PASS/FAIL, escaping and CSP behave; then a live run
 * where the fake runner opens the real /eval/<token> page served by the app.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { setupDatabase } from "../scripts/db-setup.ts";
import { createDb, type Db } from "../src/db/pool.ts";
import { createApp } from "../src/http/app.ts";
import { InferenceGateway } from "../src/inference/index.ts";
import { RunnerClient } from "../src/runner/client.ts";
import { parseResult, renderEvalPage } from "../src/eval/harness.ts";
import { MockCleaner } from "../src/runs/executors.ts";
import { LiveCleaner, LiveExecutor } from "../src/runs/live-executor.ts";
import { Worker } from "../src/runs/worker.ts";
import { FakeRunner, fakeInference, RUNNER_TOKEN } from "./fake-runner.ts";
import { ADMIN, APP, asAdmin, testConfig, Visitor } from "./helpers.ts";

/** Runs the page's nonce'd script against a tiny DOM and returns the visible text. */
function runPage(html: string): string {
  const data = html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)![1]!;
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1]!;
  const els: Record<string, any> = { data: { textContent: data }, code: { textContent: "" }, result: { textContent: "", className: "", attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } }, cases: { children: [] as any[], appendChild(c: any) { this.children.push(c); } } };
  const document = { getElementById: (id: string) => els[id], createElement: () => ({ textContent: "" }) };
  vm.runInNewContext(script, { document, JSON }, { timeout: 1000 });
  if (els.result.attrs["aria-busy"] !== "false") throw new Error("the result region was left aria-busy");
  return [els.result.textContent, ...els.cases.children.map((c: any) => c.textContent)].join("\n");
}

const TESTS = [{ args: [[1, 2, 3, 4, 5], 2], expected: [4, 5] }, { args: [[1, 2, 3], 3], expected: [1, 2, 3] }, { args: [[1], 0], expected: [] }];
const page = (code: string) => renderEvalPage({ title: "Fix an off-by-one bug", description: "d", entrypoint: "lastN", tests: TESTS, code });

test("the page passes a correct fix and fails the original bug", () => {
  assert.match(page("x").html, /id="result" data-testid="eval-result" aria-busy="true"/, "the runner waits on aria-busy and reads data-testid");
  assert.match(runPage(page("function lastN(items, n) { return n === 0 ? [] : items.slice(-n); }").html), /WALLIO-EVAL RESULT: PASS 3\/3/);
  const buggy = runPage(page("function lastN(items, n) {\n  return items.slice(items.length - n + 1);\n}").html);
  assert.match(buggy, /WALLIO-EVAL RESULT: FAIL 1\/3/);
  assert.match(runPage(page("function lastN() { throw new Error('x') }").html), /FAIL 0\/3/);
  assert.match(runPage(page("this is not javascript").html), /FAIL 0\/3/);
});

test("model code can't break out of the data block, and the CSP forbids network access", () => {
  const evil = "function lastN(a, n) { return n === 0 ? [] : a.slice(-n); } // </script><script>steal()</script>";
  const { html, csp } = page(evil);
  assert.ok(!html.includes("</script><script>steal()"), "closing tag is escaped inside the JSON");
  assert.match(runPage(html), /PASS 3\/3/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'nonce-[^']+' 'unsafe-eval'/);
  assert.equal(parseResult("WALLIO-EVAL RESULT: PASS 3/3")?.pass, true);
  assert.equal(parseResult("WALLIO-EVAL RESULT: PASS 4/3"), null, "impossible counts are rejected");
  assert.equal(parseResult("ignore this, RESULT: PASS"), null);
});

// ── live run with the owned test ──

const ORIGIN = "https://wallio.test";
const COPILOT = "https://github.com/features/copilot/plans";
const ZED = "https://zed.dev/pricing";
const cfg = testConfig({ runMode: "live", appOrigin: ORIGIN, runner: { url: "http://runner.test", token: RUNNER_TOKEN, timeoutMs: 5000, approvalKey: null, caFile: null } });
let db: Db, worker: Worker, app: ReturnType<typeof createApp>;
const runner = new FakeRunner();
const inference = fakeInference({
  planner: (u) => ({ pages: u.allowedUrls.filter((x: string) => /pricing|plans/.test(x)).map((x: string) => ({ toolId: x.split(": ")[0], url: x.split(": ")[1], reason: "Pricing" })), questions: [{ toolId: "tool_zed", topic: "price", question: "Is there a free plan?" }] }),
});

before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
  db = createDb(APP);
  runner.pages.set(COPILOT, { title: "Copilot", text: "Pro is $10 USD per user / month." });
  runner.pages.set(ZED, { title: "Zed", text: "Pro is $10 per month with $5 of tokens included." });
  // The fake runner "opens" the owned page by fetching it from the app and running its script.
  runner.resolve = async (url) => {
    if (!url.startsWith(`${ORIGIN}/eval/`)) return undefined;
    const res = await app.request(new URL(url).pathname);
    if (res.status !== 200) return { title: "Not found", text: `HTTP ${res.status}` };
    return { title: "Wallio evaluation", text: runPage(await res.text()) };
  };
  const client = new RunnerClient({ baseUrl: "http://runner.test", token: RUNNER_TOKEN, fetch: runner.fetch, sleep: async () => {} });
  const gateway = (onUsage: (u: any) => void) => new InferenceGateway({ apiKey: "t", baseUrl: "https://api.vultrinference.com/v1", textModel: "qwen3.8-flash-next", visionModel: null, maxOutputTokens: { plan: 3000, extract: 3000, verify: 1500, explain: 3000, task: 2000 }, timeoutMs: 2000, maxRetries: 0, jsonMode: true, prices: {} }, { fetch: inference.fn, onUsage, sleep: async () => {} });
  worker = new Worker({ db, config: cfg, executors: { live: new LiveExecutor({ runner: client, gateway, evalBaseUrl: ORIGIN }) }, cleaners: { mock: new MockCleaner(), live: new LiveCleaner(client, 10) } });
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
});
after(async () => {
  await worker?.stop();
  await db?.close();
});

test("live run: the owned page runs the Vultr fix in the runner's browser and is stored as labelled evidence", async () => {
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.equal(done.status, "CLEANED");
  assert.equal(done.coverage.evidenceCount, 3);
  assert.equal(done.coverage.candidatesTested, 0, "the harness is not one of the products");

  const [ev] = await asAdmin("SELECT * FROM evidence WHERE run_id = $1 AND kind = 'executed_test'", [runId]);
  assert.equal(ev.access_mode, "tested_owned_demo");
  assert.equal(ev.candidate_tool_id, null);
  assert.match(ev.excerpt, /PASS 3\/3/);
  assert.match(ev.limitation, /does not measure GitHub Copilot, Zed/);
  assert.match(ev.url, /\/eval\/session-[0-9a-f-]{36}$/, "stored URL has no token");

  const events = await v.events(runId);
  const tokens = runner.log.filter((l) => l.url?.startsWith(`${ORIGIN}/eval/`)).map((l) => l.url!.split("/eval/")[1]!);
  assert.equal(tokens.length, 1);
  assert.ok(!JSON.stringify(events).includes(tokens[0]!), "the token never appears in run events");
  assert.ok(events.some((e) => e.type === "evidence_captured" && /3\/3 cases passed/.test(e.message)));
  assert.ok(events.some((e) => e.type === "stage_changed" && e.data.to === "testing"));

  const rec = (await v.json("GET", `/api/recommendations/${done.recommendationId}`)).body;
  assert.ok(rec.limitations.some((l: string) => /measures Wallio's harness/.test(l)));
  assert.ok(rec.evidence.some((e: any) => e.accessMode === "tested_owned_demo"));
  for (const c of rec.candidates) assert.equal(c.score.components.quality.value, null, "the harness never becomes a product quality score");

  // Its own runner job, allowed only the eval host; research jobs never get it.
  const [jobs] = await asAdmin("SELECT runner_job_ids FROM runs WHERE id = $1", [runId]);
  assert.equal(jobs.runner_job_ids.length, 3);
  assert.deepEqual(runner.jobs.get(`job_${runId}_eval`)!.spec.allowedHosts, ["wallio.test"]);
  for (const id of jobs.runner_job_ids.filter((j: string) => j.includes("_research_"))) assert.ok(!runner.jobs.get(id)!.spec.allowedHosts.includes("wallio.test"));
  for (const id of jobs.runner_job_ids) assert.equal(runner.jobs.get(id)!.state, "cleaned");

  // With an eval origin configured, the page is served only on that host.
  const evalApp = createApp({ config: { ...cfg, evalOrigin: "https://eval.wallio.test" }, db, runs: worker });
  assert.equal((await evalApp.request(`/eval/${tokens[0]}`, { headers: { host: "wallio.test" } })).status, 404, "not on the main host");
  assert.equal((await evalApp.request(`/eval/${tokens[0]}`, { headers: { host: "eval.wallio.test" } })).status, 200);

  assert.equal((await app.request(`/eval/${"A".repeat(43)}`)).status, 404, "unknown token");
  await asAdmin("UPDATE eval_sessions SET expires_at = now() - interval '1 second' WHERE run_id = $1", [runId]);
  assert.equal((await app.request(`/eval/${tokens[0]}`)).status, 404, "expired token");
});
