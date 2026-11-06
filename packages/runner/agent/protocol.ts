/**
 * Daemon ↔ in-container agent protocol: one JSON object per line over the
 * container's stdin/stdout. The container has no listening port.
 *
 * The agent is our code, but it runs next to untrusted pages, so the daemon
 * treats everything it sends back as untrusted data: it re-validates sizes,
 * image bytes and shapes before anything reaches the control plane.
 */

export type AgentOp =
  | { op: "navigate"; url: string }
  | { op: "inspect"; maxElements: number }
  | { op: "click"; ref: string; approved: boolean; expectedFingerprint: string | null }
  | { op: "fill"; ref: string; value: string }
  | { op: "scroll"; direction: "up" | "down"; pixels: number }
  | { op: "screenshot"; fullPage: boolean }
  | { op: "observe" }
  | { op: "shutdown" };

export type AgentRequest = AgentOp & { id: number };

export type AgentErrorCode =
  | "egress_denied"
  | "navigation_failed"
  | "element_not_found"
  | "element_stale"
  | "approval_token_invalid"
  | "invalid_action"
  | "action_timeout"
  | "browser_crashed"
  | "internal";

export type BlockReason = "captcha" | "mfa" | "login_required" | "access_denied" | "http_error" | "egress_denied" | "download_blocked";

export interface AgentElement {
  ref: string;
  role: string;
  name: string;
  tag: string;
  text: string;
  href: string | null;
  inputType: string | null;
  targetHost: string | null;
  /** Clicking it would submit a form (needs an approval token). Stripped before leaving the runner. */
  submits: boolean;
  /** Field refuses `fill` (password, file, payment, one-time code). Stripped before leaving the runner. */
  sensitive: boolean;
}

export interface AgentObservation {
  url: string;
  title: string;
  httpStatus: number | null;
  redirectChain: string[];
  /** sha256 hex of URL (no fragment) + interactive elements + current field values. */
  fingerprintHex: string;
  textExcerpt: string | null;
  elements: AgentElement[] | null;
  /** Base64 PNG, only for `screenshot`. */
  screenshotPng: string | null;
  blocked: { reason: BlockReason; detail: string } | null;
  /** The main-frame navigation this action caused was refused by the egress proxy. */
  navigationDenied: string | null;
  capturedAt: string;
}

export type AgentReply =
  | { id: number; ok: true; observation: AgentObservation | null }
  | { id: number; ok: false; code: AgentErrorCode; message: string; observation: AgentObservation | null };

export type AgentHello = { hello: "ready"; browserVersion: string } | { hello: "failed"; message: string };

/** Hard caps the agent applies before sending, and the daemon re-checks. */
export const AGENT_CAPS = {
  textExcerptChars: 4_000,
  nameChars: 200,
  elementTextChars: 300,
  titleChars: 300,
  fingerprintElements: 200,
  maxLineBytes: 12 * 1024 * 1024,
  fullPageMaxHeight: 6_000,
} as const;
