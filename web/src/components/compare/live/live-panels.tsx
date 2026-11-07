"use client";

import { useState } from "react";
import {
  ArrowClockwise,
  Camera,
  CaretDown,
  Check,
  Cpu,
  Globe,
  Prohibit,
  ShieldCheck,
  Warning,
  X,
} from "@phosphor-icons/react";
import type {
  ApprovalIntent,
  CandidateAssessment,
  Evidence as ApiEvidence,
  Recommendation,
  Run,
  RunEvent,
  Statement,
} from "@/lib/api/contract";
import type { Evidence as UiEvidence } from "@/lib/types";
import { STAGES } from "../run-live";
import { Tag } from "@/components/kit/tag";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── shared bits ─────────────────────────────────────────────────────── */

export type Source = "live" | "recorded";
export type Kind = "comparison" | "containment" | "trial";

export function Card({
  title,
  addon,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  addon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1", className)}>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3">
        <h2 className="flex min-w-0 items-center gap-3 text-[15px] font-medium text-text-1">
          {title}
          {addon}
        </h2>
        {action}
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

export function SourceTag({ source, demo }: { source: Source; demo: boolean }) {
  if (source === "recorded") return <Tag kind="sample">Recorded run</Tag>;
  return demo ? <Tag kind="inferred">Live API · demo playback</Tag> : <Tag kind="tested">Live</Tag>;
}

const row = "flex min-h-12 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0";

export const toolName = (names: Record<string, string>, id: string | null) =>
  id ? (names[id] ?? id.replace(/^tool_/, "").replace(/_/g, " ")) : "";

const host = (url: string | null) => (url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "");

const isDemo = (events: RunEvent[]) =>
  events.some((e) => e.type === "warning" && /demo playback|RUN_MODE=mock/i.test(`${e.message} ${e.data.detail}`));

/* ── stage bar + timeline ────────────────────────────────────────────── */

export function StageBar({ events, failed = false }: { events: RunEvent[]; failed?: boolean }) {
  const last = events.at(-1);
  const now = last?.stage ?? "planning";
  // A failed run ends on "done" too; show where it actually stopped instead of a full bar.
  const reached = Math.max(0, ...events.map((e) => STAGES.findIndex((s) => s.id === e.stage)));
  const idx = failed ? reached : now === "done" ? STAGES.length : STAGES.findIndex((s) => s.id === now);
  return (
    <div className="grid grid-cols-5 gap-1.5 px-6 py-4" aria-label={failed ? `Stopped at: ${STAGES[idx]?.label}` : `Stage: ${now}`}>
      {STAGES.map((s, i) => (
        <div key={s.id} className="flex min-w-0 flex-col gap-2">
          <span
            className={cn(
              "h-1 rounded-[1px] transition-colors duration-300",
              i < idx ? "bg-lime" : i === idx && last ? (failed ? "bg-danger" : "bg-aurora") : "bg-surface-3",
            )}
          />
          <span className={cn("truncate text-[12px]", i === idx && last ? (failed ? "text-danger" : "text-text-1") : "text-text-3")}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function EventIcon({ e }: { e: RunEvent }) {
  const box = "grid size-5 shrink-0 place-items-center rounded-[5px]";
  switch (e.type) {
    case "policy_denied":
      return <span className={cn(box, "bg-surface-3 text-text-1")}><Prohibit size={12} /></span>;
    case "cleanup":
      return e.data.result === "cleaned" ? (
        <span className={cn(box, "bg-lime-tint text-lime")}><Check size={12} weight="bold" /></span>
      ) : (
        <span className={cn(box, "bg-surface-3 text-danger")}><X size={12} weight="bold" /></span>
      );
    case "inference_call":
      return <span className={cn(box, "bg-surface-3 text-aurora")}><Cpu size={12} /></span>;
    case "evidence_captured":
      return <span className={cn(box, "bg-surface-3 text-text-2")}><Camera size={12} /></span>;
    case "step":
      return <span className={cn(box, "bg-surface-3 text-text-2")}><Globe size={12} /></span>;
    case "approval_required":
      return <span className={cn(box, "border border-aurora")}><span className="size-1.5 rounded-[1px] bg-aurora" /></span>;
    case "containment_result":
      return <span className={cn(box, "bg-lime-tint text-lime")}><ShieldCheck size={12} /></span>;
    case "result_ready":
    case "approval_resolved":
    case "action_result":
      return <span className={cn(box, "bg-lime-tint text-lime")}><Check size={12} weight="bold" /></span>;
    case "warning":
      return <span className={cn(box, "bg-surface-3 text-text-3")}><Warning size={12} /></span>;
    case "error":
      return <span className={cn(box, "bg-surface-3 text-danger")}><X size={12} weight="bold" /></span>;
    default:
      return <span className={cn(box)}><span className="size-1 rounded-[1px] bg-text-3" /></span>;
  }
}

/** Every event the API sent, one line each, with seconds since the run started. */
export function Timeline({ events, open }: { events: RunEvent[]; open: boolean }) {
  const t0 = events[0] ? new Date(events[0].ts).getTime() : 0;
  if (!open) return null;
  return (
    <ol className="flex flex-col border-t border-line" aria-live="polite">
      {events.map((e) => (
        <li key={e.seq} className={cn(row, "min-h-11 py-2.5")}>
          <EventIcon e={e} />
          <span
            className={cn(
              "min-w-0 flex-1 text-[14px]",
              e.type === "status_changed" || e.type === "stage_changed" ? "text-text-3" : "text-text-1",
            )}
          >
            {e.message}
            {e.type === "policy_denied" && (
              <span className="text-text-3"> · <span className="font-mono text-[12px] [overflow-wrap:anywhere]">{e.data.target}</span></span>
            )}
          </span>
          <span className="tnum shrink-0 text-[12px] text-text-3">
            {Math.max(0, Math.round((new Date(e.ts).getTime() - t0) / 1000))}s
          </span>
        </li>
      ))}
    </ol>
  );
}

export function RunCard({
  title,
  events,
  run,
  error,
  source,
  onRetryRecorded,
}: {
  title: string;
  events: RunEvent[];
  run: Run | null;
  error: string | null;
  source: Source;
  onRetryRecorded?: () => void;
}) {
  const finished = run !== null;
  const [openPick, setOpen] = useState<boolean | null>(null);
  const open = openPick ?? !finished;
  const t0 = events[0] ? new Date(events[0].ts).getTime() : 0;
  const t1 = events.at(-1) ? new Date(events.at(-1)!.ts).getTime() : 0;
  return (
    <Card
      title={title}
      addon={<SourceTag source={source} demo={isDemo(events)} />}
      action={
        events.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text-1"
          >
            {events.length} events{finished ? ` · ${Math.round((t1 - t0) / 1000)}s` : ""}
            <CaretDown size={12} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        )
      }
    >
      <StageBar events={events} failed={!!error} />
      {events.length === 0 && !error && (
        <p className="flex min-h-12 items-center gap-3 border-t border-line px-6 text-text-3">
          <span className="size-1.5 animate-pulse rounded-[1px] bg-aurora" /> Starting the run
        </p>
      )}
      <Timeline events={events} open={open} />
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="min-w-0 text-text-1">
            <span className="text-danger">Couldn&apos;t run it. </span>
            {error}
          </p>
          {onRetryRecorded && (
            <Button variant="secondary" size="sm" onClick={onRetryRecorded}>
              Play the recorded run instead
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Vultr proof ─────────────────────────────────────────────────────── */

export function VultrPanel({
  events,
  runs,
  demo,
  source,
  pinnedModel,
}: {
  events: RunEvent[];
  runs: Run[];
  demo: boolean;
  source: Source;
  pinnedModel: string;
}) {
  const calls = events.filter((e) => e.type === "inference_call");
  const cleanups = events.filter((e) => e.type === "cleanup");
  const denied = events.filter((e) => e.type === "policy_denied");
  const spent = runs.reduce((n, r) => n + r.spend.actualMinor, 0);
  const cap = runs.at(-1)?.spend.capMinor ?? 50;
  const allClean = cleanups.length > 0 && cleanups.every((c) => c.data.result === "cleaned" && c.data.containerRemoved && c.data.volumeRemoved);

  const rows: [string, React.ReactNode][] = [
    ["API", "Vultr Cloud Compute · Los Angeles"],
    [
      "Mode",
      source === "recorded" ? (
        "Recorded from the API"
      ) : demo ? (
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-[1px] bg-aurora" /> Demo playback
        </span>
      ) : (
        "Live runs"
      ),
    ],
    ["Pinned model", <span key="m" className="font-mono text-[13px]">{pinnedModel}</span>],
    ["Model calls", calls.length === 0 ? "None yet" : `${calls.length}`],
    [
      "Browser",
      cleanups.length === 0 ? (
        "One container per job"
      ) : demo ? (
        "Nothing to remove in demo playback"
      ) : allClean ? (
        <span key="c" className="flex items-center gap-1.5 text-lime"><Check size={12} weight="bold" /> Removed and checked</span>
      ) : (
        <span key="c" className="text-danger">Cleanup failed</span>
      ),
    ],
    ["Blocked", `${denied.length} request${denied.length === 1 ? "" : "s"}`],
    ["Spend", runs.length ? <span key="s" className="tnum"><Money cents={spent} /> of <Money cents={cap} /></span> : "Nothing yet"],
  ];

  return (
    <Card title="On Vultr">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className={cn(row, "justify-between gap-6")}>
            <dt className="shrink-0 text-text-3">{k}</dt>
            <dd className="min-w-0 truncate text-right text-text-1">{v}</dd>
          </div>
        ))}
      </dl>
      {calls.length > 0 && (
        <ul className="border-t border-line">
          {calls.map((c) => (
            <li key={`${c.runId}-${c.seq}`} className="flex min-h-10 items-center gap-3 px-6 text-[13px]">
              <Cpu size={12} className="shrink-0 text-aurora" />
              <span className="min-w-0 flex-1 truncate text-text-2">
                {c.data.purpose} · <span className="font-mono">{c.data.model}</span>
              </span>
              <span className="tnum shrink-0 text-text-3">{c.data.latencyMs} ms</span>
            </li>
          ))}
        </ul>
      )}
      {runs.length > 0 && (
        <div className="border-t border-line px-6 py-3">
          <p className="text-[13px] text-text-3">Correlation IDs</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {runs.map((r) => (
              <li key={r.id} className="truncate font-mono text-[12px] text-text-2">
                {r.kind.replace("_", " ")} · {r.correlationId}
              </li>
            ))}
          </ul>
        </div>
      )}
      {demo && source === "live" && (
        <p className="border-t border-line px-6 py-3 text-[13px] text-text-3">
          The API is in demo playback: the run, approval and policy checks are real, the browser and model calls are not yet.
        </p>
      )}
    </Card>
  );
}

/* ── recommendation ──────────────────────────────────────────────────── */

export const ACTION: Record<Recommendation["action"], string> = {
  keep: "Keep what you have",
  try: "Try it",
  compare_further: "Compare further",
  replace_after_validation: "Replace after a test",
  review_renewal: "Review the renewal",
  no_action: "Nothing to do",
};

export const ROLE: Record<Statement["role"], string> = {
  supporting: "For it",
  counter: "Against it",
  uncertainty: "Not sure yet",
  next_step: "Next step",
};

function access(a: CandidateAssessment["accessMode"]) {
  if (a === "researched") return <Tag kind="researched" />;
  return <Tag kind="tested">{a === "tested_owned_demo" ? "Tested in our demo" : "Tested"}</Tag>;
}

const pct = (n: number) => Math.round(n * 100);

export function RecommendationCard({
  rec,
  names,
  demo,
  onEvidence,
  children,
}: {
  rec: Recommendation;
  names: Record<string, string>;
  demo: boolean;
  onEvidence: (id: string) => void;
  children?: React.ReactNode;
}) {
  const order: Statement["role"][] = ["supporting", "counter", "uncertainty", "next_step"];
  const statements = [...rec.statements].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const evIndex = new Map(rec.evidence.map((e, i) => [e.id, i + 1]));
  return (
    <Card
      title="The answer"
      addon={demo ? <Tag kind="sample">Demo playback</Tag> : undefined}
      action={<span className="text-[13px] text-text-3">Confidence {rec.confidence}</span>}
    >
      <div className="flex flex-col gap-1 px-6 py-5">
        <p className="text-[13px] text-text-3">{ACTION[rec.action]}</p>
        <p className="display text-[22px] leading-7 font-medium text-text-1">{rec.headline}</p>
      </div>

      <ul className="border-t border-line">
        {rec.candidates.map((c) => (
          <li key={c.toolId} className={cn(row, "flex-wrap sm:flex-nowrap")}>
            <ToolMark name={toolName(names, c.toolId)} />
            <span className="min-w-0 flex-1 truncate text-text-1">
              {toolName(names, c.toolId)}{" "}
              <span className="text-text-3">{c.role === "incumbent" ? "yours" : "candidate"}</span>
            </span>
            {access(c.accessMode)}
            <span className="tnum w-24 shrink-0 text-right text-[13px] text-text-2">
              {c.testResult ? `${c.testResult.passed} of ${c.testResult.attempts} passed` : "Not tested"}
            </span>
            <span className="tnum w-16 shrink-0 text-right text-text-1">
              {c.score ? (pct(c.score.min) === pct(c.score.max) ? pct(c.score.min) : `${pct(c.score.min)}–${pct(c.score.max)}`) : <span className="text-text-3">Unknown</span>}
            </span>
          </li>
        ))}
      </ul>

      <ul className="border-t border-line">
        {statements.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-6 py-3 first:border-t-0 sm:flex-nowrap">
            <span className="w-full shrink-0 text-[13px] text-text-3 sm:w-28">{ROLE[s.role]}</span>
            <span className="min-w-0 flex-1 text-text-1">{s.text}</span>
            <span className="flex shrink-0 flex-wrap items-center gap-1.5">
              {s.evidenceIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onEvidence(id)}
                  className="h-7 rounded-md border border-line px-2 text-[12px] text-text-2 transition-colors hover:border-line-strong hover:text-text-1"
                >
                  Source {evIndex.get(id) ?? "?"}
                </button>
              ))}
              {s.userInputRefs.length > 0 && <Tag kind="user_input" />}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-line px-6 py-4">
        <p className="text-[13px] text-text-3">Money</p>
        {rec.spending.scenarios.length === 0 ? (
          <p className="mt-1 text-text-2">No savings estimate. A price it needs isn&apos;t known, so it doesn&apos;t guess.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {rec.spending.scenarios.map((sc) => (
              <li key={sc.label} className="flex flex-wrap justify-between gap-x-4 text-text-1">
                <span>{sc.label}</span>
                <span className="tnum text-text-2">
                  {sc.monthlyEquivalentDeltaMinor === null ? "Unknown" : <Money cents={sc.monthlyEquivalentDeltaMinor} />} a month
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-6 py-4">
        <p className="text-[13px] text-text-3">What this can&apos;t tell you</p>
        <ul className="mt-1 flex flex-col gap-1 text-text-2">
          {rec.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <ul className="border-t border-line">
        {rec.evidence.map((e, i) => (
          <li key={e.id} className="border-t border-line first:border-t-0">
            <button type="button" onClick={() => onEvidence(e.id)} className="group flex min-h-12 w-full items-center gap-3 px-6 py-3 text-left">
              <span className="tnum w-14 shrink-0 text-[13px] text-text-3">Source {i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text-1">{host(e.url)}</span>
              <span className="hidden shrink-0 text-[13px] text-text-3 group-hover:text-text-1 sm:block">Open</span>
            </button>
          </li>
        ))}
      </ul>

      {children}
    </Card>
  );
}

/* ── evidence mapping ────────────────────────────────────────────────── */

const METHOD: Record<ApiEvidence["extractionMethod"], string> = {
  dom: "Read from the page",
  vision: "Read from the screenshot",
  api: "From an API",
  manual: "Entered by hand",
};

export function toUiEvidence(e: ApiEvidence, opts: { demo: boolean; screenshotUrl?: string }): UiEvidence {
  const title =
    e.kind === "executed_test"
      ? "Test result"
      : e.kind === "vendor_claim"
        ? "Vendor page"
        : e.kind === "observed_behavior"
          ? "What the browser saw"
          : "Your input";
  return {
    id: e.id,
    kind: opts.demo ? "sample" : e.kind === "executed_test" ? "tested" : e.kind === "user_input" ? "user_input" : "researched",
    title,
    source: host(e.url) || "Wallio",
    capturedAt: e.capturedAt,
    limitation: e.limitation,
    hash: e.contentHash ? `${e.contentHash.startsWith("sha256:") ? "" : "sha256:"}${e.contentHash.slice(0, 23)}…` : undefined,
    method: METHOD[e.extractionMethod],
    excerpt: e.excerpt,
    screenshotUrl: e.hasScreenshot ? opts.screenshotUrl : undefined,
    screenshotNote: opts.demo
      ? "Demo playback image from the API. A live run stores the real screenshot here."
      : "Screenshot taken in the sandbox.",
  };
}

/* ── trial request + approval ────────────────────────────────────────── */

export type Replay = { status: number; message: string; correlationId?: string } | null;

export function ApprovalCard({
  intent,
  candidate,
  busy,
  decided,
  replay,
  onDecide,
  onReplay,
  onShowForm,
}: {
  intent: ApprovalIntent;
  candidate: string;
  busy: boolean;
  decided: "approved" | "declined" | null;
  replay: Replay;
  onDecide: (d: "approve" | "decline") => void;
  onReplay: () => void;
  onShowForm: () => void;
}) {
  const expires = new Date(intent.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <div className="border-t border-line">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3">
        <h3 className="flex items-center gap-3 text-[15px] font-medium text-text-1">
          {decided === null && <span className="size-1.5 rounded-[1px] bg-aurora" aria-hidden="true" />}
          {decided === null ? `Ask ${candidate} for a trial?` : decided === "approved" ? "Approved and used once" : "Declined. Nothing was sent."}
        </h3>
        <span className="text-[13px] text-text-3">{decided === null ? `Valid until ${expires}` : intent.status}</span>
      </div>
      <dl className="border-t border-line">
        <div className={cn(row, "justify-between gap-6")}>
          <dt className="shrink-0 text-text-3">Sends to</dt>
          <dd className="min-w-0 truncate text-right font-mono text-[13px] text-text-1">{intent.targetUrl.replace(/^https:\/\//, "")}</dd>
        </div>
        {intent.fields.map((f) => (
          <div key={f.name} className={cn(row, "justify-between gap-6")}>
            <dt className="shrink-0 text-text-3">{f.label}</dt>
            <dd className="min-w-0 truncate text-right text-text-1">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-6 py-3 text-[13px] text-text-2">{intent.consequence}</p>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
        {decided === null ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => onDecide("approve")}>
              Approve and send once
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onDecide("decline")}>
              Decline
            </Button>
          </>
        ) : (
          decided === "approved" && (
            <Button variant="secondary" disabled={busy || replay !== null} onClick={onReplay}>
              <ArrowClockwise size={14} /> Try approving it again
            </Button>
          )
        )}
        <Button variant="ghost" onClick={onShowForm}>
          See the form
        </Button>
      </div>
      {replay && (
        <div className="flex items-start gap-3 border-t border-line px-6 py-4">
          {replay.status >= 400 ? (
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-lime" />
          ) : (
            <Warning size={16} className="mt-0.5 shrink-0 text-danger" />
          )}
          <p className="min-w-0 text-text-1">
            {replay.status >= 400 ? `Refused by the API (${replay.status}). ` : "The API accepted a second decision. "}
            <span className="text-text-2">{replay.message}</span>
            {replay.correlationId && <span className="block font-mono text-[12px] text-text-3">{replay.correlationId}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── containment ─────────────────────────────────────────────────────── */

export function ContainmentCard({ events, demo, healthy }: { events: RunEvent[]; demo: boolean; healthy: boolean | null }) {
  const result = events.find((e) => e.type === "containment_result");
  const cleanup = events.find((e) => e.type === "cleanup");
  const denied = events.filter((e) => e.type === "policy_denied");
  if (!result || result.type !== "containment_result") return null;
  const d = result.data;
  const rows: [string, React.ReactNode, boolean][] = [
    ["Contained", d.contained ? "Yes" : "No", d.contained],
    ["Actions refused", String(d.refusedActions), true],
    ["Requests denied", String(d.deniedRequests), true],
    [
      "Sentinel file",
      d.sentinel ? (d.sentinel.before === d.sentinel.after ? "Unchanged" : "Changed") : demo ? "Not read in demo playback" : "Couldn't be read",
      d.sentinel ? d.sentinel.before === d.sentinel.after : false,
    ],
    [
      "Container and volume",
      !cleanup || cleanup.type !== "cleanup"
        ? "Waiting"
        : demo
          ? "Nothing to remove in demo playback"
          : cleanup.data.containerRemoved && cleanup.data.volumeRemoved
            ? "Removed"
            : "Not removed",
      !demo && cleanup?.type === "cleanup" && cleanup.data.containerRemoved && cleanup.data.volumeRemoved,
    ],
    ["Wallio API afterwards", healthy === null ? "Checking" : healthy ? "Healthy" : "Not answering", healthy === true],
  ];
  return (
    <Card title="Containment result" addon={demo ? <Tag kind="sample">Demo playback</Tag> : undefined}>
      <dl>
        {rows.map(([k, v, good]) => (
          <div key={k} className={cn(row, "justify-between gap-6")}>
            <dt className="shrink-0 text-text-3">{k}</dt>
            <dd className={cn("flex min-w-0 items-center gap-1.5 text-right", good ? "text-lime" : "text-text-1")}>
              {good && <Check size={12} weight="bold" />}
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {denied.length > 0 && (
        <ul className="border-t border-line">
          {denied.map((e) =>
            e.type === "policy_denied" ? (
              <li key={e.seq} className={cn(row, "flex-wrap")}>
                <Prohibit size={13} className="shrink-0 text-text-1" />
                <span className="min-w-0 flex-1 text-text-1">{e.data.target.replace(new RegExp(`^${e.data.attemptedAction}\\s+`), "")}</span>
                <span className="text-[13px] text-text-3 [overflow-wrap:anywhere]">{e.data.reason}</span>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </Card>
  );
}

/* ── plan sections: allowlist and success rubric (docs/GOLDEN_PATH.md §5, §7) ── */

const ALLOWLIST: [string, string, string][] = [
  ["Copilot research", "github.com", "/features/copilot"],
  ["Zed research", "zed.dev", "/pricing"],
  ["Owned test page", "eval.<domain>", "/eval/"],
  ["Owned trial form", "forms.<domain>", "/"],
  ["Hostile test page", "hostile.<domain>", "/"],
];

/** Where the runner may go. Everything else is denied at the egress proxy. */
export function AllowlistCard() {
  return (
    <Card title="Where the runner may go">
      <ul>
        {ALLOWLIST.map(([what, h, path]) => (
          <li key={what} className={cn(row, "justify-between gap-4")}>
            <span className="min-w-0 truncate text-text-2">{what}</span>
            <span className="min-w-0 truncate text-right font-mono text-[12px] text-text-1">
              {h}
              <span className="text-text-3">{path}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-6 py-3 text-[13px] text-text-3">
        Everything else is denied: private ranges, link-local, cloud metadata, loopback and their IPv6 forms. Redirects are checked again.
      </p>
    </Card>
  );
}

export type CheckState = "pass" | "fail" | "waiting";
export interface Check {
  name: string;
  condition: string;
  state: CheckState;
  note: string;
}

/** The plan's success rubric, checked against what this page has seen. */
export function SuccessChecks({ checks }: { checks: Check[] }) {
  const passed = checks.filter((c) => c.state === "pass").length;
  return (
    <Card title="Success checks" action={<span className="tnum text-[13px] text-text-3">{passed} of {checks.length} pass</span>}>
      <ul>
        {checks.map((c) => (
          <li key={c.name} className="flex flex-col gap-1 border-t border-line px-6 py-3 first:border-t-0">
            <span className="flex items-center gap-2 text-text-1">
              {c.state === "pass" ? (
                <Check size={13} weight="bold" className="shrink-0 text-lime" />
              ) : c.state === "fail" ? (
                <X size={13} weight="bold" className="shrink-0 text-danger" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-[1px] bg-text-3" aria-hidden="true" />
              )}
              {c.name}
            </span>
            <span className="min-w-0 pl-[21px]">
              <span className="block text-[13px] text-text-2">{c.condition}</span>
              <span className={cn("block text-[13px]", c.state === "pass" ? "text-lime" : c.state === "fail" ? "text-danger" : "text-text-3")}>
                {c.note}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
