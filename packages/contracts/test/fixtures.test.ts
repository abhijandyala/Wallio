import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ZodType } from "zod";
import { api, runner } from "../src/index.ts";

const load = (rel: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), "utf8"));

/** Every fixture file and the schema it must satisfy. `list: true` = array of items. */
const MANIFEST: Array<{ file: string; schema: ZodType; list?: boolean }> = [
  { file: "api/comparison-request.json", schema: api.ComparisonRequest },
  { file: "api/comparison-accepted.json", schema: api.ComparisonAccepted },
  { file: "api/run-running.json", schema: api.Run },
  { file: "api/run-events.json", schema: api.RunEvent, list: true },
  { file: "api/inventory.json", schema: api.InventoryResponse },
  { file: "api/profile-version.json", schema: api.ProfileVersion },
  { file: "api/recommendation.json", schema: api.Recommendation },
  { file: "api/approval-intent.json", schema: api.ApprovalIntent },
  { file: "api/approval-decision.json", schema: api.ApprovalDecisionRequest },
  { file: "api/trial-request-create.json", schema: api.TrialRequestCreate },
  { file: "api/containment-run-create.json", schema: api.ContainmentRunCreate },
  { file: "api/run-events-p7.json", schema: api.RunEvent, list: true },
  { file: "api/decision-request.json", schema: api.DecisionRequest },
  { file: "api/error.json", schema: api.ApiError },
  { file: "runner/job-create.json", schema: runner.RunnerJobCreate },
  { file: "runner/job-status.json", schema: runner.RunnerJobStatus },
  { file: "runner/action-requests.json", schema: runner.RunnerActionRequest, list: true },
  { file: "runner/result-ok-pricing.json", schema: runner.RunnerActionResult },
  { file: "runner/result-denied-hostile.json", schema: runner.RunnerActionResult },
  { file: "runner/cancel.json", schema: runner.RunnerCancelRequest },
  { file: "runner/cleanup-cleaned.json", schema: runner.CleanupReport },
];

for (const { file, schema, list } of MANIFEST) {
  test(`fixture ${file} matches its schema`, () => {
    const data = load(file);
    const items = list ? (data as unknown[]) : [data];
    items.forEach((item, i) => {
      const r = schema.safeParse(item);
      assert.ok(r.success, `${file}[${i}]: ${r.success ? "" : JSON.stringify(r.error.issues, null, 2)}`);
    });
  });
}

test("run event seq is strictly increasing", () => {
  const events = load("api/run-events.json") as Array<{ seq: number }>;
  events.forEach((e, i) => i > 0 && assert.ok(e.seq > events[i - 1]!.seq));
});

// ── Guardrails the contract must enforce (negative cases) ──

const rec = () => structuredClone(load("api/recommendation.json")) as any;

test("rejects a factual statement with no evidence or user input", () => {
  const r = rec();
  r.statements[0] = { text: "Candidate is faster.", role: "supporting", evidenceIds: [], userInputRefs: [] };
  assert.equal(api.Recommendation.safeParse(r).success, false);
});

test("rejects a statement citing evidence that is not shipped", () => {
  const r = rec();
  r.statements[0].evidenceIds = ["ev_made_up"];
  assert.equal(api.Recommendation.safeParse(r).success, false);
});

test("rejects evidence without a limitation", () => {
  const r = rec();
  r.evidence[0].limitation = "";
  assert.equal(api.Recommendation.safeParse(r).success, false);
});

test("rejects float money", () => {
  const req = load("api/comparison-request.json") as any;
  assert.equal(api.ComparisonRequest.safeParse({ ...req, spendCapMinor: 0.5 }).success, false);
});

test("rejects weights that do not sum to 1", () => {
  const req = load("api/comparison-request.json") as any;
  const weights = { quality: 0.5, fit: 0.5, cost: 0.5, privacy: 0, switching: 0 };
  assert.equal(api.ComparisonRequest.safeParse({ ...req, weights }).success, false);
});

test("rejects inferred profile attribute without source", () => {
  const p = load("api/profile-version.json") as any;
  p.attributes[0].source = null;
  assert.equal(api.ProfileVersion.safeParse(p).success, false);
});

test("rejects runner actions outside the vocabulary", () => {
  for (const action of [
    { type: "eval", script: "fetch('http://169.254.169.254')" },
    { type: "shell", cmd: "ls" },
    { type: "navigate", url: "http://insecure.example" },
    { type: "navigate", url: "file:///etc/passwd" },
  ]) {
    assert.equal(runner.RunnerActionRequest.safeParse({ actionId: "a", stepIndex: 0, action }).success, false, JSON.stringify(action));
  }
});

test("rejects runner limits above PRD ceilings", () => {
  const job = load("runner/job-create.json") as any;
  assert.equal(runner.RunnerJobCreate.safeParse({ ...job, limits: { ...job.limits, deadlineMs: 600_000 } }).success, false);
  assert.equal(runner.RunnerJobCreate.safeParse({ ...job, limits: { ...job.limits, maxActions: 50 } }).success, false);
});

test("rejects allowed hosts with scheme, port or IP", () => {
  const job = load("runner/job-create.json") as any;
  for (const host of ["https://a.example", "a.example:8080", "10.0.0.5", "localhost"]) {
    assert.equal(runner.RunnerJobCreate.safeParse({ ...job, allowedHosts: [host] }).success, false, host);
  }
});

test("rejects ok action result that also carries an error", () => {
  const r = load("runner/result-ok-pricing.json") as any;
  r.error = { code: "internal", message: "x", retryable: false };
  assert.equal(runner.RunnerActionResult.safeParse(r).success, false);
});

test("rejects 'cleaned' without verified removal", () => {
  const c = load("runner/cleanup-cleaned.json") as any;
  assert.equal(runner.CleanupReport.safeParse({ ...c, volumeRemoved: false }).success, false);
  assert.equal(runner.CleanupReport.safeParse({ ...c, verifiedAt: null }).success, false);
});
