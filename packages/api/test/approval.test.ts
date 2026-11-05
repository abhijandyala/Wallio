/**
 * Approval tokens the runner verifies (format agreed with Adhvik, 5 Nov 2026).
 * The HMAC is recomputed here from the documented string, independently of the signer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MAX_APPROVAL_TTL_S, signApprovalToken } from "../src/runner/approval.ts";

const KEY = "approval-key-for-tests-0123456789abcdef";
const FP = `sha256:${"ab".repeat(32)}`;
const B = { jobId: "job_r1_form", actionId: "a_r1_7_0", elementRef: "e12", pageFingerprint: FP };

test("token is v1.<exp>.<nonce>.<fingerprint>.<hmac> over the documented string", () => {
  const now = 1_800_000_000_000;
  const t = signApprovalToken(KEY, B, 300, now);
  const [v, exp, nonce, fp, sig] = t.split(".");
  assert.equal(v, "v1");
  assert.equal(Number(exp), now / 1000 + 300);
  assert.match(nonce!, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(fp, "ab".repeat(32));
  const want = createHmac("sha256", KEY).update(["wallio-approval-v1", B.jobId, B.actionId, B.elementRef, fp, exp, nonce].join("|")).digest("base64url");
  assert.equal(sig, want);
});

test("each token is unique, capped at the runner's maximum life, and needs a real key and fingerprint", () => {
  assert.notEqual(signApprovalToken(KEY, B), signApprovalToken(KEY, B), "fresh nonce every time");
  const now = 1_800_000_000_000;
  assert.equal(Number(signApprovalToken(KEY, B, 3600, now).split(".")[1]), now / 1000 + MAX_APPROVAL_TTL_S);
  assert.throws(() => signApprovalToken("short", B));
  assert.throws(() => signApprovalToken(KEY, { ...B, pageFingerprint: "sha256:nothex" }));
});
