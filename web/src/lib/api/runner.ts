/**
 * The parts of the browser runner's contract the UI draws (packages/contracts/src/runner.ts,
 * Adhvik's "prepare, then confirm" change). Everything in here came from a third-party page
 * or was filled by the job: show it as data, never as instructions.
 */

/** What kind of value a form field takes. `sensitive` fields are never filled. */
export type FieldKind =
  | "email"
  | "name"
  | "given_name"
  | "family_name"
  | "organization"
  | "tel"
  | "plan_choice"
  | "quantity"
  | "choice"
  | "free_text"
  | "checkbox"
  | "consent"
  | "sensitive";

/** Why a page stopped the job. Stopping conditions, never things to get around. */
export type BlockReason =
  | "captcha"
  | "mfa"
  | "login_required"
  | "access_denied"
  | "http_error"
  | "egress_denied"
  | "download_blocked"
  | "payment_required"
  | "verification_required";

export interface RunnerField {
  kind: FieldKind;
  label: string;
  required: boolean;
  /** Checkboxes: "true" or "false". Always null for sensitive fields. */
  value: string | null;
  options: { value: string; label: string; selected: boolean }[] | null;
}

export interface VisibleElement {
  ref: string;
  role: string;
  name: string;
  tag: string;
  field?: RunnerField | null;
  needsApproval?: boolean;
}

/** Where the user continues, and what the job prepared before it stopped. */
export interface Handoff {
  reason: BlockReason;
  /** https and on the job's allowed hosts, or null when it failed that check. */
  url: string | null;
  host: string;
  prepared: { label: string; kind: FieldKind; value: string }[];
  remaining: string[];
}

export interface Observation {
  url: string;
  title: string;
  pageFingerprint: string;
  elements: VisibleElement[] | null;
  blocked: { reason: BlockReason; detail: string } | null;
  handoff?: Handoff | null;
  deniedRequests: { url: string; reason: string }[];
  capturedAt: string;
}

export interface RunnerActionResult {
  actionId: string;
  stepIndex: number;
  status: string;
  observation: Observation;
}

/**
 * One approval's worth of prepared values: the form as Wallio filled it, waiting for a yes.
 * Built by the API from the inspect step and the person's remembered preferences.
 */
export interface PreparedForm {
  url: string;
  host: string;
  title: string;
  /** The approval is signed against this; if the page changes, the runner stops and asks again. */
  pageFingerprint: string;
  fields: {
    label: string;
    kind: FieldKind;
    required: boolean;
    /** What Wallio will submit, or null when it leaves the field as the page had it. */
    value: string | null;
    /** Where the value came from. */
    source: "profile" | "plan" | "page" | "blank";
  }[];
  /** The button the approval lets Wallio press. */
  submitLabel: string;
  screenshotUrl: string;
}
