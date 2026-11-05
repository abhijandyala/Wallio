import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signApprovalToken, verifyApprovalToken, MAX_APPROVAL_TTL_S } from "../../src/approval/token.ts";
import { NonceStore } from "../../src/state.ts";

const KEY = "k".repeat(40);
const FP = "sha256:" + "ab".repeat(32);
const bind = { jobId: "job_1", actionId: "act_9", elementRef: "e3", pageFingerprint: FP };
const expect = { jobId: "job_1", actionId: "act_9", elementRef: "e3" };

test("valid token verifies and carries the approved fingerprint", () => {
  const t = signApprovalToken(KEY, bind);
  const v = verifyApprovalToken(KEY, t, expect);
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.fingerprintHex, "ab".repeat(32));
});

test("token is bound to job, action and element", () => {
  const t = signApprovalToken(KEY, bind);
  assert.equal(verifyApprovalToken(KEY, t, { ...expect, jobId: "job_2" }).ok, false);
  assert.equal(verifyApprovalToken(KEY, t, { ...expect, actionId: "act_10" }).ok, false);
  assert.equal(verifyApprovalToken(KEY, t, { ...expect, elementRef: "e4" }).ok, false);
});

test("wrong key, tampered fingerprint and malformed tokens are refused", () => {
  const t = signApprovalToken(KEY, bind);
  assert.equal(verifyApprovalToken("x".repeat(40), t, expect).ok, false);
  const parts = t.split(".");
  parts[3] = "cd".repeat(32);
  assert.equal(verifyApprovalToken(KEY, parts.join("."), expect).ok, false);
  for (const bad of ["", "v1", "apt_7c1d9e0b4a2f8e61", "v2.1.2.3.4", t + "x"]) assert.equal(verifyApprovalToken(KEY, bad, expect).ok, false, bad);
});

test("expired and over-long tokens are refused", () => {
  const old = signApprovalToken(KEY, bind, 60, Date.now() - 120_000);
  assert.match((verifyApprovalToken(KEY, old, expect) as any).message, /expired/);
  const t = signApprovalToken(KEY, bind, 60);
  assert.equal(verifyApprovalToken(KEY, t, expect, Date.now() - (MAX_APPROVAL_TTL_S + 100) * 1000).ok, false);
});

test("nonce store allows each approval once, also across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "nonce-"));
  const exp = Math.floor(Date.now() / 1000) + 300;
  assert.equal(new NonceStore(dir).consume("n1", exp), true);
  const again = new NonceStore(dir);
  assert.equal(again.consume("n1", exp), false);
  assert.equal(again.consume("n2", exp), true);
});
