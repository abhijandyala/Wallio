/**
 * Real runner samples from Adhvik's branch (packages/runner/samples, RUNNER_DRIVER=fake,
 * the sample vendor at fixtures.wallio.test). Used until the API passes these through.
 */
import type { Handoff, PreparedForm, RunnerActionResult } from "@/lib/api/runner";
import inspect from "./signup-inspect.json";
import login from "./handoff-login.json";
import payment from "./blocked-payment_required.json";
import verification from "./blocked-verification_required.json";

const hostOf = (url: string) => new URL(url).host;

/** The signup form, prepared: the inspect step's fields with the values the job then filled. */
function prepared(): PreparedForm {
  const page = (inspect as RunnerActionResult).observation;
  const filled = new Map(((login as RunnerActionResult).observation.handoff?.prepared ?? []).map((p) => [p.label, p.value]));
  const fields = (page.elements ?? []).flatMap((e) => (e.field ? [e.field] : []));
  const submit = (page.elements ?? []).find((e) => e.needsApproval);
  return {
    url: page.url,
    host: hostOf(page.url),
    title: page.title,
    pageFingerprint: page.pageFingerprint,
    fields: fields.map((f) => {
      const value = filled.get(f.label) ?? null;
      const source: PreparedForm["fields"][number]["source"] =
        value !== null
          ? f.kind === "plan_choice" || f.kind === "quantity" || f.kind === "choice" || f.kind === "consent"
            ? "plan"
            : "profile"
          : f.value
            ? "page"
            : "blank";
      return { label: f.label, kind: f.kind, required: f.required, value: value ?? (f.value || null), source };
    }),
    submitLabel: submit?.name ?? "Continue",
    screenshotUrl: "/runner/signup-prepared.png",
  };
}

export const runnerSamples = {
  prepared: prepared(),
  login: (login as RunnerActionResult).observation.handoff as Handoff,
  payment: (payment as RunnerActionResult).observation.handoff as Handoff,
  verification: (verification as RunnerActionResult).observation.handoff as Handoff,
};
