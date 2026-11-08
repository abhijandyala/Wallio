/**
 * Approval tokens for clicks with an external effect (PRD §15, Flow E).
 *
 * The API signs a token only after the user approves an intent. The runner
 * verifies it independently (signature, expiry, job, action, element, and the page
 * fingerprint including current field values) and allows it once.
 *
 * Signing is the runner's own code (@wallio/runner/approval), so the two sides can't
 * drift. This wrapper only adds input checks, so a misconfigured key or a malformed
 * fingerprint fails here, loudly, instead of producing a token the runner refuses.
 *
 * Format: v1.<expEpochSeconds>.<nonce>.<fingerprintHex>.<base64url HMAC-SHA256>
 */
import { MAX_APPROVAL_TTL_S, signApprovalToken as runnerSign, type ApprovalBinding } from "@wallio/runner/approval";

export { MAX_APPROVAL_TTL_S, type ApprovalBinding };

export function signApprovalToken(key: string, b: ApprovalBinding, ttlSeconds = 300, now = Date.now()): string {
  if (!key || key.length < 32) throw new Error("RUNNER_APPROVAL_KEY must be at least 32 characters");
  if (!/^[a-f0-9]{64}$/.test(b.pageFingerprint.replace(/^sha256:/, ""))) throw new Error("pageFingerprint must be a sha256 hex digest");
  return runnerSign(key, b, Math.max(1, ttlSeconds), now);
}
