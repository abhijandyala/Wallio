/**
 * Wallio's own synthetic trial-request form (forms.<domain>/trial/<token>).
 *
 * The runner's browser fills it with fixed synthetic values and submits it only
 * after the user approves the exact intent. It goes to Wallio's database, never to
 * a vendor. A token accepts exactly one submission (wallio_form_submit).
 */
import { createHash, randomBytes } from "node:crypto";

/** Field labels double as the accessible names the runner's inspect reports. */
export const TRIAL_FIELDS = [
  { name: "product", label: "Product" },
  { name: "full_name", label: "Your name" },
  { name: "email", label: "Contact email" },
  { name: "team_size", label: "Team size" },
  { name: "note", label: "Note" },
] as const;
export const SUBMIT_LABEL = "Send trial request";

/** Fixed synthetic values. No personal data: the address is on a reserved example domain. */
export function syntheticValues(toolName: string): Record<string, string> {
  return {
    product: toolName,
    full_name: "Wallio demo user",
    email: "trial-request@wallio.example",
    team_size: "1",
    note: `Synthetic ${toolName} trial request prepared by Wallio for a demo. No vendor receives this.`,
  };
}

export function newFormToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: formTokenHash(token) };
}
export const formTokenHash = (token: string) => createHash("sha256").update(`form:${token}`).digest("hex");
export const newReference = () => `WT-${randomBytes(4).toString("hex").toUpperCase()}`;

/** Validates a submitted body: only the known fields, bounded lengths. Returns null if malformed. */
export function parseSubmission(body: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const f of TRIAL_FIELDS) {
    const v = body[f.name];
    if (typeof v !== "string" || v.length > 300) return null;
    out[f.name] = v;
  }
  return Object.keys(body).every((k) => out[k] !== undefined) ? out : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fff}
h1{font-size:1.4rem}label{display:block;margin:.8rem 0 .2rem;font-weight:600}input,textarea{width:100%;padding:.5rem;font:inherit;border:1px solid #999;border-radius:6px;box-sizing:border-box}
button{margin-top:1rem;padding:.6rem 1.2rem;font:inherit;font-weight:600;border:0;border-radius:6px;background:#1f5eff;color:#fff}
.note{background:#f3f5f9;padding:.6rem .8rem;border-radius:6px;font-size:.9rem}.ok{color:#11733c}`;

/** No scripts at all; the form posts only to itself. */
export const FORM_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export function renderFormPage(toolName: string): string {
  const fields = TRIAL_FIELDS.map((f) =>
    f.name === "note"
      ? `<label for="${f.name}">${f.label}</label><textarea id="${f.name}" name="${f.name}" aria-label="${f.label}" rows="3" maxlength="300"></textarea>`
      : `<label for="${f.name}">${f.label}</label><input id="${f.name}" name="${f.name}" aria-label="${f.label}" type="${f.name === "email" ? "email" : "text"}" maxlength="300" autocomplete="off">`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Request a ${esc(toolName)} trial (Wallio synthetic form)</title><style>${STYLE}</style></head>
<body><h1>Request a ${esc(toolName)} trial</h1>
<p class="note">Wallio's own synthetic form for the demo. Submitting it records a request in Wallio only; no vendor is contacted and nothing is bought.</p>
<form method="post">
${fields}
<button type="submit">${SUBMIT_LABEL}</button>
</form></body></html>`;
}

export function renderResultPage(kind: "accepted" | "duplicate", reference: string | null): string {
  const title = kind === "accepted" ? "Request received" : "Already received";
  const body = kind === "accepted"
    ? `<p class="ok">Request received. Reference ${esc(reference ?? "")}.</p><p class="note">Recorded in Wallio only. No vendor was contacted.</p>`
    : `<p>This request was already received${reference ? ` (reference ${esc(reference)})` : ""}. It was not sent again.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head><body><h1>${title}</h1>${body}</body></html>`;
}
