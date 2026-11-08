/**
 * Owned evaluation harness (golden path §4.2).
 *
 * 1. A Vultr model proposes a fix for the sample bug (server side; the key never leaves).
 * 2. The fix is stored with a short-lived random token (only its hash is kept).
 * 3. The runner's isolated browser opens /eval/<token>. The page runs the fix
 *    against fixed test cases and prints "WALLIO-EVAL RESULT: PASS n/m".
 *
 * Model-written code is never executed on this server. In the page it runs under a
 * CSP with no network access, inside the runner's container.
 *
 * What this measures: Wallio's harness on a Vultr model. It does NOT measure the
 * commercial products being compared, and is labelled that way everywhere.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { InferenceGateway } from "../inference/index.ts";

export const RESULT_RE = /WALLIO-EVAL RESULT: (PASS|FAIL) (\d+)\/(\d+)/;
const IDENT = /^[A-Za-z_$][\w$]{0,40}$/;

export const Fix = z.object({ code: z.string().min(10).max(4000) });

export interface EvalTask { id: string; title: string; description: string; sanitizedInput: string; entrypoint: string; tests: unknown[] }

export async function proposeFix(gw: InferenceGateway, correlationId: string, task: EvalTask): Promise<{ code: string; model: string }> {
  if (!IDENT.test(task.entrypoint)) throw new Error("task entrypoint is not a plain identifier");
  const out = await gw.chatJSON({
    purpose: "task",
    correlationId,
    schema: Fix,
    messages: [
      { role: "system", content: `You fix bugs in small JavaScript functions. Reply with ONLY JSON {"code": "<the complete corrected function>"}. The function must be named ${task.entrypoint}. No comments, no explanation, no imports, no I/O.` },
      { role: "user", content: `${task.description}\n\n${task.sanitizedInput}` },
    ],
  });
  if (!new RegExp(`\\b${task.entrypoint}\\b`).test(out.data.code)) throw new Error(`the proposed fix doesn't define ${task.entrypoint}`);
  return { code: out.data.code, model: out.model };
}

export function newEvalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: tokenHash(token) };
}
export const tokenHash = (token: string) => createHash("sha256").update(`eval:${token}`).digest("hex");

/** Parses the page's result line, e.g. "WALLIO-EVAL RESULT: PASS 3/3". */
export function parseResult(text: string | null): { pass: boolean; passed: number; total: number; line: string } | null {
  const m = text?.match(RESULT_RE);
  if (!m) return null;
  const passed = Number(m[2]), total = Number(m[3]);
  if (!(total > 0) || passed > total) return null;
  return { pass: m[1] === "PASS" && passed === total, passed, total, line: m[0] };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The page the runner opens. Data is embedded as JSON (with "<" escaped) and read by a nonce'd script. */
export function renderEvalPage(p: { title: string; description: string; entrypoint: string; tests: unknown[]; code: string }): { html: string; csp: string } {
  if (!IDENT.test(p.entrypoint)) throw new Error("bad entrypoint");
  const nonce = randomBytes(16).toString("base64");
  const data = JSON.stringify({ entrypoint: p.entrypoint, tests: p.tests, code: p.code }).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Wallio evaluation: ${esc(p.title)}</title>
<style>body{font:15px/1.5 ui-monospace,Menlo,monospace;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fff}
h1{font:600 1.2rem system-ui,sans-serif}pre{background:#f4f4f6;padding:.75rem;overflow:auto}#result{font-size:1.4rem;font-weight:700;margin:1rem 0}
.pass{color:#11733c}.fail{color:#b3261e}li{margin:.2rem 0}</style></head>
<body>
<h1>Wallio owned evaluation: ${esc(p.title)}</h1>
<p>${esc(p.description)}</p>
<p>This page tests a fix proposed by a model on Vultr. It does not test any commercial product.</p>
<h2>Proposed fix</h2><pre id="code"></pre>
<div id="result" data-testid="eval-result" aria-busy="true" aria-live="polite">WALLIO-EVAL RUNNING</div><ol id="cases"></ol>
<script type="application/json" id="data">${data}</script>
<script nonce="${nonce}">
(function () {
  var r = document.getElementById("result");
  try {
  var d = JSON.parse(document.getElementById("data").textContent);
  document.getElementById("code").textContent = d.code;
  var list = document.getElementById("cases"), passed = 0, fn = null;
  try { fn = new Function(d.code + "\\n;return typeof " + d.entrypoint + " === 'function' ? " + d.entrypoint + " : null;")(); } catch (e) { fn = null; }
  d.tests.forEach(function (t, i) {
    var ok = false, got;
    try { got = fn ? fn.apply(null, JSON.parse(JSON.stringify(t.args))) : undefined; ok = JSON.stringify(got) === JSON.stringify(t.expected); } catch (e) { got = "threw " + e.name; }
    if (ok) passed++;
    var li = document.createElement("li");
    li.textContent = (ok ? "PASS " : "FAIL ") + d.entrypoint + "(" + JSON.stringify(t.args).slice(1, -1) + ") expected " + JSON.stringify(t.expected) + ", got " + (typeof got === "string" ? got : JSON.stringify(got));
    list.appendChild(li);
  });
  var all = passed === d.tests.length;
  r.textContent = "WALLIO-EVAL RESULT: " + (all ? "PASS " : "FAIL ") + passed + "/" + d.tests.length;
  r.className = all ? "pass" : "fail";
  } catch (e) {
    r.textContent = "WALLIO-EVAL ERROR";
  } finally {
    r.setAttribute("aria-busy", "false"); // the runner waits while this is "true" (max 15 s)
  }
})();
</script></body></html>`;
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-eval'`,
    "style-src 'unsafe-inline'",
    "connect-src 'none'",
    "img-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return { html, csp };
}
