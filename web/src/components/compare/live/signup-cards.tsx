"use client";

import { useState } from "react";
import { ArrowSquareOut, Check, CreditCard, EnvelopeSimple, LockKey, ShieldCheck } from "@phosphor-icons/react";
import type { BlockReason, FieldKind, Handoff, PreparedForm } from "@/lib/api/runner";
import { Tag } from "@/components/kit/tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "./live-panels";

const row = "flex min-h-12 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0";

const GROUP: Record<FieldKind, "you" | "plan" | "agree" | null> = {
  email: "you",
  name: "you",
  given_name: "you",
  family_name: "you",
  organization: "you",
  tel: "you",
  plan_choice: "plan",
  quantity: "plan",
  choice: "plan",
  free_text: "plan",
  checkbox: "agree",
  consent: "agree",
  sensitive: null,
};
const GROUP_LABEL = { you: "About you", plan: "Plan", agree: "What you agree to" } as const;

const shown = (kind: FieldKind, value: string) =>
  kind === "consent" || kind === "checkbox" ? (/^(true|ticked|yes)$/i.test(value) ? "Ticked" : "Not ticked") : value;

/**
 * Prepare, then confirm: the form as Wallio filled it, and one yes for all of it.
 * Nothing is submitted until this is approved, and the approval only covers this page as
 * it was when Wallio prepared it.
 */
export function PreparedCard({
  form,
  decided,
  busy = false,
  onDecide,
}: {
  form: PreparedForm;
  decided: "approved" | "declined" | null;
  busy?: boolean;
  onDecide: (d: "approve" | "decline") => void;
}) {
  const [showPage, setShowPage] = useState(false);
  const filled = form.fields.filter((f) => f.value !== null && GROUP[f.kind]);
  const blank = form.fields.filter((f) => f.value === null && f.kind !== "sensitive");
  const groups = (["you", "plan", "agree"] as const)
    .map((g) => ({ g, fields: filled.filter((f) => GROUP[f.kind] === g) }))
    .filter((x) => x.fields.length > 0);

  return (
    <div>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3">
        <h3 className="flex items-center gap-3 text-[15px] font-medium text-text-1">
          {decided === null && <span className="size-1.5 rounded-[1px] bg-aurora" aria-hidden="true" />}
          {decided === null
            ? `Press “${form.submitLabel}” with these details?`
            : decided === "approved"
              ? "Approved. Wallio pressed it once."
              : "Declined. Nothing was sent."}
        </h3>
        <span className="font-mono text-[13px] text-text-2">{form.host}</span>
      </div>

      {groups.map(({ g, fields }) => (
        <div key={g} className="border-t border-line">
          <p className="px-6 pt-3 text-[12px] tracking-[0.04em] text-text-3 uppercase">{GROUP_LABEL[g]}</p>
          <dl>
          {fields.map((f) => (
            <div key={f.label} className={cn(row, "justify-between gap-6 border-t-0")}>
              <dt className="min-w-0 text-text-2">
                {f.label}
                {f.source === "profile" && <span className="ml-2 text-[12px] text-text-3">from your profile</span>}
              </dt>
              <dd
                className={cn(
                  "min-w-0 truncate text-right",
                  g === "agree" ? "flex items-center gap-1.5 text-aurora" : "text-text-1",
                )}
              >
                {g === "agree" && <Check size={12} weight="bold" />}
                {shown(f.kind, f.value!)}
              </dd>
            </div>
          ))}
          </dl>
        </div>
      ))}

      {blank.length > 0 && (
        <p className="border-t border-line px-6 py-3 text-[13px] text-text-3">
          Left blank: {blank.map((f) => f.label).join(", ")}
        </p>
      )}
      <p className="flex items-start gap-2.5 border-t border-line px-6 py-3 text-[13px] text-text-2">
        <ShieldCheck size={15} className="mt-px shrink-0 text-lime" />
        One approval covers these values on this page. If the page changes before Wallio continues, it stops
        and asks you again. Passwords and payment details are never filled.
      </p>

      {showPage && (
        <figure className="border-t border-line bg-bg px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- runner screenshot, shown as captured */}
          <img
            src={form.screenshotUrl}
            alt={`The ${form.title.toLowerCase()} page on ${form.host}, filled in by Wallio`}
            className="max-h-[220px] w-full rounded-[10px] border border-line object-cover object-top"
          />
          <figcaption className="mt-2 font-mono text-[12px] break-all text-text-3">
            {form.url.replace(/^https:\/\//, "")} · {form.pageFingerprint.slice(0, 19)}
          </figcaption>
        </figure>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
        {decided === null && (
          <>
            <Button variant="primary" disabled={busy} onClick={() => onDecide("approve")}>
              Approve and continue
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onDecide("decline")}>
              Decline
            </Button>
          </>
        )}
        <Button variant="ghost" aria-expanded={showPage} onClick={() => setShowPage((v) => !v)}>
          {showPage ? "Hide the page" : "See the page"}
        </Button>
      </div>
    </div>
  );
}

const HANDOFF: Partial<Record<BlockReason, { icon: typeof LockKey; title: (host: string) => string; why: string; cta: string }>> = {
  login_required: {
    icon: LockKey,
    title: (h) => `Sign in on ${h} to finish`,
    why: "Wallio never signs in or creates passwords for you.",
    cta: "Continue to sign in",
  },
  mfa: {
    icon: LockKey,
    title: (h) => `Enter your code on ${h}`,
    why: "One-time codes stay with you.",
    cta: "Continue",
  },
  captcha: {
    icon: ShieldCheck,
    title: (h) => `${h} wants a human check`,
    why: "Wallio never gets around human checks.",
    cta: "Continue",
  },
  payment_required: {
    icon: CreditCard,
    title: (h) => `Pay on ${h} in your own browser`,
    why: "Wallio never enters card or bank details.",
    cta: "Continue to payment",
  },
  verification_required: {
    icon: EnvelopeSimple,
    title: () => "Confirm your email",
    why: "Only you can open the link the site emailed you.",
    cta: "Open the page",
  },
};

/**
 * The job stopped at a step only the person can do. Where to go, what Wallio already
 * prepared there, and a short checklist of what's left.
 */
export function HandoffCard({ handoff, onDone }: { handoff: Handoff; onDone?: () => void }) {
  const copy = HANDOFF[handoff.reason] ?? {
    icon: ShieldCheck,
    title: (h: string) => `Finish on ${h}`,
    why: "This step needs you.",
    cta: "Continue",
  };
  const Icon = copy.icon;
  const [done, setDone] = useState<boolean[]>(() => handoff.remaining.map(() => false));
  const all = done.every(Boolean);

  return (
    <div>
      <div className="flex items-start gap-4 px-6 py-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface-3 text-aurora">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-medium text-text-1">{copy.title(handoff.host)}</h3>
          <p className="mt-1 text-text-2">{copy.why} Wallio stopped here and left the rest to you.</p>
        </div>
      </div>

      {handoff.prepared.length > 0 && (
        <div className="border-t border-line">
          <p className="px-6 pt-3 text-[12px] tracking-[0.04em] text-text-3 uppercase">Already filled in</p>
          <dl>
            {handoff.prepared.map((p) => (
              <div key={p.label} className={cn(row, "justify-between gap-6 border-t-0")}>
                <dt className="min-w-0 text-text-2">{p.label}</dt>
                <dd className="min-w-0 truncate text-right text-text-1">{shown(p.kind, p.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <fieldset className="border-t border-line px-6 py-4">
        <legend className="mb-3 text-[12px] tracking-[0.04em] text-text-3 uppercase">Left for you</legend>
        <ol className="flex flex-col gap-2.5">
          {handoff.remaining.map((step, i) => (
            <li key={step}>
              <label className="flex cursor-pointer items-start gap-3 text-text-1">
                <input
                  type="checkbox"
                  checked={done[i]}
                  onChange={(e) => setDone((d) => d.map((x, j) => (j === i ? e.target.checked : x)))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-aurora/60",
                    done[i] ? "border-lime bg-lime text-ink" : "border-line-strong",
                  )}
                >
                  {done[i] && <Check size={11} weight="bold" />}
                </span>
                <span className={cn(done[i] && "text-text-3 line-through")}>{step}</span>
              </label>
            </li>
          ))}
        </ol>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-6 py-4">
        {handoff.url ? (
          <a
            href={handoff.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: all ? "secondary" : "primary" }), "gap-2")}
          >
            {copy.cta} <ArrowSquareOut size={14} />
          </a>
        ) : (
          <span className="text-text-2">
            Go to <span className="font-mono text-text-1">{handoff.host}</span> yourself. Wallio couldn&apos;t confirm a
            safe link.
          </span>
        )}
        {onDone && (
          <Button variant={all ? "primary" : "secondary"} disabled={!all} onClick={onDone}>
            I&apos;ve done this
          </Button>
        )}
        <span className="text-[13px] text-text-3">
          Check the address bar says <span className="font-mono text-text-2">{handoff.host}</span>
        </span>
      </div>
    </div>
  );
}

type Step = "prepared" | "login" | "payment" | "verification" | "finished" | "declined";
const STEPS: { id: Exclude<Step, "declined">; label: string }[] = [
  { id: "prepared", label: "Your approval" },
  { id: "login", label: "Sign in" },
  { id: "payment", label: "Payment" },
  { id: "verification", label: "Email" },
  { id: "finished", label: "Done" },
];

/**
 * A signup, start to finish, on the runner's sample vendor: Wallio prepares the form, you
 * approve once, then it hands each step only you can do back to you.
 * TODO(api): drive this from the run's events once the API passes prepared forms and handoffs.
 */
export function SignupFlow({
  samples,
}: {
  samples: { prepared: PreparedForm; login: Handoff; payment: Handoff; verification: Handoff };
}) {
  const [step, setStep] = useState<Step>("prepared");
  const at = STEPS.findIndex((s) => s.id === step);

  return (
    <Card title="Sign up for the Pro plan" addon={<Tag kind="sample">Runner sample</Tag>}>
      <ol className="grid grid-cols-5 gap-1.5 px-6 py-4" aria-label="Signup steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-col gap-2" aria-current={i === at ? "step" : undefined}>
            <span
              className={cn(
                "h-1 rounded-[1px] transition-colors duration-300",
                step === "declined" ? "bg-surface-3" : i < at ? "bg-lime" : i === at ? "bg-aurora" : "bg-surface-3",
              )}
            />
            <span className={cn("truncate text-[12px]", i === at ? "text-text-1" : "text-text-3")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="border-t border-line">
        {step === "prepared" || step === "declined" ? (
          <PreparedCard
            form={samples.prepared}
            decided={step === "declined" ? "declined" : null}
            onDecide={(d) => setStep(d === "approve" ? "login" : "declined")}
          />
        ) : step === "login" ? (
          <HandoffCard key="login" handoff={samples.login} onDone={() => setStep("payment")} />
        ) : step === "payment" ? (
          <HandoffCard key="payment" handoff={samples.payment} onDone={() => setStep("verification")} />
        ) : step === "verification" ? (
          <HandoffCard key="verification" handoff={samples.verification} onDone={() => setStep("finished")} />
        ) : (
          <div className="flex items-start gap-4 px-6 py-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-lime-tint text-lime">
              <Check size={20} weight="bold" />
            </span>
            <div>
              <h3 className="text-[17px] font-medium text-text-1">You&apos;re signed up</h3>
              <p className="mt-1 text-text-2">
                Wallio filled the form once with your approval. You signed in, paid and confirmed your email yourself.
              </p>
            </div>
          </div>
        )}
      </div>
      {(step === "declined" || step === "finished") && (
        <div className="border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={() => setStep("prepared")}>
            Start again
          </Button>
        </div>
      )}
    </Card>
  );
}
