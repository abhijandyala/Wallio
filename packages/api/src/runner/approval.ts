/**
 * Approval tokens for clicks with an external effect (PRD §15, Flow E).
 *
 * The API signs a token only after the user approves an intent. Adhvik's runner
 * verifies it independently (signature, expiry, job, action, element, and the page
 * fingerprint including current field values) and allows it once.
 *
 * This must stay byte-compatible with packages/runner/src/approval/token.ts on
 * Adhvik's branch. Once @wallio/runner is merged to main, import signApprovalToken
 * from "@wallio/runner/approval" instead and delete this file.
 *
 * Format: v1.<expEpochSeconds>.<nonce>.<fingerprintHex>.<base64url HMAC-SHA256>
 * Signed string: "wallio-approval-v1|jobId|actionId|elementRef|fingerprintHex|exp|nonce"
 */
import { createHmac, randomBytes } from "node:crypto";

/** The runner refuses anything that lives longer than this. */
export const MAX_APPROVAL_TTL_S = 600;

export interface ApprovalBinding {
  jobId: string;
  actionId: string;
  elementRef: string;
  /** `observation.pageFingerprint` the user approved, "sha256:<hex>" or bare hex. */
  pageFingerprint: string;
}

const hex = (fp: string) => fp.replace(/^sha256:/, "");

export function approvalMac(key: string, b: ApprovalBinding, exp: number, nonce: string): string {
  return createHmac("sha256", key)
    .update(["wallio-approval-v1", b.jobId, b.actionId, b.elementRef, hex(b.pageFingerprint), exp, nonce].join("|"))
    .digest("base64url");
}

export function signApprovalToken(key: string, b: ApprovalBinding, ttlSeconds = 300, now = Date.now()): string {
  if (!key || key.length < 32) throw new Error("RUNNER_APPROVAL_KEY must be at least 32 characters");
  if (!/^[a-f0-9]{64}$/.test(hex(b.pageFingerprint))) throw new Error("pageFingerprint must be a sha256 hex digest");
  const exp = Math.floor(now / 1000) + Math.max(1, Math.min(ttlSeconds, MAX_APPROVAL_TTL_S));
  const nonce = randomBytes(12).toString("base64url");
  return `v1.${exp}.${nonce}.${hex(b.pageFingerprint)}.${approvalMac(key, b, exp, nonce)}`;
}
