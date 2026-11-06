/**
 * Approval tokens for clicks with an external effect (PRD §15, Flow E).
 *
 * The control plane signs a token only after the user approves an intent. The
 * runner verifies it independently and allows it once. A token is bound to
 * the job, the action, the element and the page fingerprint the user saw, so
 * a changed page, a different button or a replay is refused.
 *
 * Format: v1.<expEpochSeconds>.<nonce>.<fingerprintHex>.<base64url HMAC-SHA256>
 * Signed string: "wallio-approval-v1|jobId|actionId|elementRef|fingerprintHex|exp|nonce"
 *
 * The control plane imports `signApprovalToken` from "@wallio/runner/approval".
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Longest validity the runner accepts, however the token was signed. */
export const MAX_APPROVAL_TTL_S = 600;

export interface ApprovalBinding {
  jobId: string;
  actionId: string;
  elementRef: string;
  /** `observation.pageFingerprint` the user approved, "sha256:<hex>" or bare hex. */
  pageFingerprint: string;
}

const hex = (fp: string) => fp.replace(/^sha256:/, "");
const mac = (key: string, b: ApprovalBinding, exp: number, nonce: string) =>
  createHmac("sha256", key).update(["wallio-approval-v1", b.jobId, b.actionId, b.elementRef, hex(b.pageFingerprint), exp, nonce].join("|")).digest("base64url");

export function signApprovalToken(key: string, b: ApprovalBinding, ttlSeconds = 300, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + Math.min(ttlSeconds, MAX_APPROVAL_TTL_S);
  const nonce = randomBytes(12).toString("base64url");
  return `v1.${exp}.${nonce}.${hex(b.pageFingerprint)}.${mac(key, b, exp, nonce)}`;
}

export type VerifyResult =
  | { ok: true; nonce: string; exp: number; fingerprintHex: string }
  | { ok: false; message: string };

/** Checks shape, signature, binding and expiry. Single use is enforced separately by NonceStore. */
export function verifyApprovalToken(key: string, token: string, expect: Omit<ApprovalBinding, "pageFingerprint">, now = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return { ok: false, message: "The approval token is malformed." };
  const [, expStr, nonce, fpHex, sig] = parts as [string, string, string, string, string];
  const exp = Number(expStr);
  if (!/^\d{9,12}$/.test(expStr) || !/^[A-Za-z0-9_-]{8,64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(fpHex)) {
    return { ok: false, message: "The approval token is malformed." };
  }
  const want = Buffer.from(mac(key, { ...expect, pageFingerprint: fpHex }, exp, nonce));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { ok: false, message: "The approval token does not match this job, action and element." };
  }
  const nowS = Math.floor(now / 1000);
  if (exp <= nowS) return { ok: false, message: "The approval has expired. Ask the user again." };
  if (exp - nowS > MAX_APPROVAL_TTL_S) return { ok: false, message: "The approval token lives longer than the runner allows." };
  return { ok: true, nonce, exp, fingerprintHex: fpHex };
}
