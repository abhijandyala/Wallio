"use client";

import { useCallback, useState } from "react";
import { load as loadKey, useApi } from "@/lib/api/cache";
import { DecisionsSkeleton } from "./decisions-skeleton";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import { api, explainFailure } from "@/lib/api/client";
import type { ApprovalIntent, DecisionLogEntry, Recommendation } from "@/lib/api/contract";
import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { ButtonLink } from "@/components/kit/button-link";
import { Button } from "@/components/ui/button";
import { ACTION, ApprovalCard, ROLE, type Replay } from "@/components/compare/live/live-panels";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { decisionsSample } from "@/mocks/decisions";
import { DecisionsView } from "./decisions-view";

const day = (iso: string) => iso.slice(0, 10);

const CHOICE: Record<DecisionLogEntry["choice"], string> = {
  accept: "Accepted",
  dismiss: "Dismissed",
  disagree: "You disagreed",
};

/**
 * Decisions, from the Wallio API (GET /api/decisions): approvals waiting on you, open
 * recommendations (accept, later, dismiss), what you put off, and the history with its
 * check-ins. If the API can't be reached, the sample screen shows instead, labelled as such.
 */
export function DecisionsLive() {
  // Shared with Home and prefetched by the app shell, so this is usually instant.
  const decisions = useApi("decisions");
  const data = decisions.data ?? null;
  const failed = decisions.error && !decisions.loading ? explainFailure(decisions.error) : null;
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await loadKey("decisions", { force: true });
    } catch {
      // Shown through `failed`.
    }
  }, []);

  /** Run a write, then refetch so the page shows what the API now holds. */
  const act = async (fn: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(explainFailure(e));
    }
    await load();
  };

  if (failed && !data) {
    return (
      <div className="flex flex-col gap-gutter">
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-1 px-5 py-3">
          <span className="text-text-1">{failed}</span>
          <span className="text-text-3">Showing sample data meanwhile.</span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void load()}>
            Try again
          </Button>
        </div>
        <DecisionsView data={decisionsSample} />
      </div>
    );
  }

  if (!data) return <DecisionsSkeleton />;

  const waiting = data.approvals.length;
  const open = data.recommendations.length;
  const estimates = data.history
    .filter((h) => h.choice === "accept" && h.estimatedAnnualSavingMinor !== null)
    .map((h) => h.estimatedAnnualSavingMinor as number);
  const nothing = waiting + open + data.deferred.length + data.history.length === 0;

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Decisions"
        subtitle={
          <>
            {waiting > 0 ? <span className="text-text-1">{waiting} waiting on you</span> : "Nothing waiting on you"}
            {" · "}
            {open} open recommendation{open === 1 ? "" : "s"}
          </>
        }
      />

      {notice && (
        <p role="status" className="rounded-[12px] border border-line bg-surface-1 px-5 py-3 text-text-1">
          {notice}
        </p>
      )}

      {nothing ? (
        <Panel title="No decisions yet">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[36rem] text-text-2">
              Run a comparison and choose what to do with its answer. Approvals, recommendations and what you
              decided all land here, and Wallio checks back 14 days later.
            </p>
            <ButtonLink href="/compare?live=1" variant="primary">
              Run a comparison
            </ButtonLink>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-12 gap-gutter xl:grid-rows-[auto_auto_1fr]">
          {/* Right, and first on phones: what needs you. */}
          <div className="col-span-12 flex flex-col gap-gutter xl:col-span-8 xl:col-start-5 xl:row-span-3 xl:row-start-1">
            {data.approvals.map((a) => (
              <LiveApproval key={a.id} intent={a} onDone={() => void load()} />
            ))}

            <Panel
              title="Recommendations"
              titleAddon={<span className="tnum text-[13px] font-normal text-text-3">{open}</span>}
              flush
            >
              {open === 0 ? (
                <p className="border-t border-line px-6 py-5 text-text-3">Nothing open. New answers from Compare show up here.</p>
              ) : (
                <ul className="border-t border-line">
                  {data.recommendations.map((r) => (
                    <RecRow
                      key={r.id}
                      rec={r}
                      onAccept={() => act(() => api.recordDecision({ recommendationId: r.id, choice: "accept" }))}
                      onLater={() => act(() => api.defer(r.id))}
                      onDismiss={() => act(() => api.dismiss(r.id))}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            {data.deferred.length > 0 && (
              <Panel title="Later" flush>
                <ul className="border-t border-line">
                  {data.deferred.map((d) => (
                    <li key={d.recommendationId} className="flex min-h-12 items-center gap-4 border-t border-line px-6 py-3 first:border-t-0">
                      <span className="min-w-0 flex-1 truncate text-text-2">{d.headline}</span>
                      <span className="tnum shrink-0 text-[13px] text-text-3">Back {formatShortDate(d.until)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          {/* Left: decision memory. */}
          <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-1">
            <section className="w-gloss flex flex-col gap-1 rounded-[20px] border border-line bg-surface-1 p-6">
              <p className="text-[13px] text-text-3">Estimated yearly saving from what you accepted</p>
              {estimates.length > 0 ? (
                <p className="display text-[44px] leading-[48px] font-medium text-lime">
                  <Money cents={estimates.reduce((n, c) => n + c, 0)} dropCents />
                  <span className="ml-1 text-[15px] font-normal tracking-normal text-text-3">/yr</span>
                </p>
              ) : (
                <p className="text-text-2">No estimate yet. Accepted answers with a known saving add up here.</p>
              )}
            </section>
          </div>

          <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-2">
            <Panel title="History" flush>
              {data.history.length === 0 ? (
                <p className="border-t border-line px-6 py-5 text-text-3">Nothing decided yet.</p>
              ) : (
                <ul className="border-t border-line">
                  {data.history.map((h) => (
                    <HistoryRow key={h.id} entry={h} onAnswer={(r) => act(() => api.outcome(h.id, r))} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-3 xl:self-start">
            <AgentAlone />
          </div>
        </div>
      )}
    </div>
  );
}

function AgentAlone() {
  return (
    <Panel title="What the agent does alone" flush>
      <KeyValue className="border-t border-line">
        <KeyValueRow label="Read public pages">In a sandbox</KeyValueRow>
        <KeyValueRow label="Submit a form">Asks you first</KeyValueRow>
        <KeyValueRow label="Cancel a plan">Gives you the link</KeyValueRow>
        <KeyValueRow label="Pay for anything">Never</KeyValueRow>
      </KeyValue>
    </Panel>
  );
}

/** A waiting approval, decided with POST /api/approvals/:id/decision (echoing its intentHash). */
function LiveApproval({ intent, onDone }: { intent: ApprovalIntent; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<"approved" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const product = intent.fields.find((f) => /product|tool/i.test(f.label))?.value ?? "this tool";
  const replay: Replay = null;

  async function decide(d: "approve" | "decline") {
    setBusy(true);
    setError(null);
    try {
      await api.decide(intent.id, d, intent.intentHash);
      setDecided(d === "approve" ? "approved" : "declined");
      setTimeout(onDone, 1200);
    } catch (e) {
      setError(explainFailure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Waiting on you" flush>
      <ApprovalCard
        intent={intent}
        candidate={product}
        busy={busy}
        decided={decided}
        replay={replay}
        onDecide={(d) => void decide(d)}
        onReplay={() => {}}
        onShowForm={() => window.open(api.screenshotUrl(intent.screenshotEvidenceId), "_blank", "noopener")}
      />
      {error && <p className="border-t border-line px-6 py-3 text-[13px] text-danger">{error}</p>}
    </Panel>
  );
}

function RecRow({
  rec,
  onAccept,
  onLater,
  onDismiss,
}: {
  rec: Recommendation;
  onAccept: () => Promise<void>;
  onLater: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const why = rec.statements.filter((s) => s.role !== "next_step");
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <span className="hidden w-[120px] shrink-0 text-[13px] text-text-2 sm:block">{ACTION[rec.action]}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-left text-text-1"
        >
          <span className="truncate">{rec.headline}</span>
          <CaretDown size={12} className={cn("shrink-0 text-text-3 transition-transform", open && "rotate-180")} />
        </button>
        <span className="tnum hidden w-24 shrink-0 text-right text-[13px] text-text-3 md:block">
          {formatShortDate(day(rec.createdAt))}
        </span>
        <span className="flex shrink-0 items-center gap-1 max-sm:w-full">
          <Button variant="secondary" size="sm" disabled={busy} onClick={run(onAccept)} className="w-[84px]">
            Accept
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={run(onLater)}
            className="h-8 rounded-md px-2.5 text-[13px] text-text-3 transition-colors hover:text-text-1 disabled:opacity-50"
          >
            Later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={run(onDismiss)}
            aria-label={`Dismiss: ${rec.headline}`}
            className="grid size-8 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1 disabled:opacity-50"
          >
            <X size={14} />
          </button>
        </span>
      </div>
      {open && (
        <ul className="flex flex-col gap-2 px-6 pb-4">
          {why.map((s, i) => (
            <li key={i} className="flex gap-4 text-[13px]">
              <span className="w-24 shrink-0 text-text-3">{ROLE[s.role]}</span>
              <span className="text-text-2">{s.text}</span>
            </li>
          ))}
          <li className="text-[13px] text-text-3">Confidence {rec.confidence}</li>
        </ul>
      )}
    </li>
  );
}

function HistoryRow({ entry, onAnswer }: { entry: DecisionLogEntry; onAnswer: (r: "helped" | "no_change") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const answer = (r: "helped" | "no_change") => async () => {
    setBusy(true);
    await onAnswer(r);
    setBusy(false);
  };
  const pending = entry.result === "pending";
  const label =
    entry.result === "helped"
      ? "Helped"
      : entry.result === "no_change"
        ? "No change"
        : entry.result === null
          ? CHOICE[entry.choice]
          : null;
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-6 py-3 first:border-t-0">
      <ToolMark name={entry.targetToolName ?? entry.headline} />
      <span className="flex min-w-[9rem] flex-1 flex-col">
        <span className="truncate text-text-1">{entry.headline}</span>
        <span className="tnum text-[12px] text-text-3">
          {CHOICE[entry.choice]} {formatShortDate(day(entry.decidedAt))}
          {entry.estimatedAnnualSavingMinor !== null && (
            <>
              {" · about "}
              <Money cents={entry.estimatedAnnualSavingMinor} dropCents />
              {"/yr, estimated"}
            </>
          )}
        </span>
      </span>
      {pending ? (
        <span className="flex shrink-0 items-center gap-1" title={entry.checkInOn ? `Check-in due ${formatShortDate(entry.checkInOn)}` : undefined}>
          <span className="mr-1 text-[13px] text-aurora">Did it help?</span>
          <button
            type="button"
            disabled={busy}
            onClick={answer("helped")}
            aria-label="Yes, it helped"
            className="grid size-7 place-items-center rounded-md border border-line text-text-2 transition-colors hover:text-text-1 disabled:opacity-50"
          >
            <Check size={12} weight="bold" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={answer("no_change")}
            aria-label="No change"
            className="grid size-7 place-items-center rounded-md border border-line text-text-2 transition-colors hover:text-text-1 disabled:opacity-50"
          >
            <X size={12} weight="bold" />
          </button>
        </span>
      ) : (
        label && (
          <span className={cn("shrink-0 text-right text-[13px]", entry.result === "helped" ? "text-lime" : "text-text-3")}>
            {label}
          </span>
        )
      )}
    </li>
  );
}
