"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import type { DiscoverData, Evidence, FitComponentKey, Match } from "@/lib/types";
import { hostFor } from "@/mocks/compare";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MatchDetail } from "./match-detail";
import {
  AlsoCheckedPanel,
  DEFAULT_WEIGHTS,
  FilteredOutPanel,
  HowRankedPanel,
  ShortlistPanel,
  WeightsPanel,
  weightPct,
  type Weights,
} from "./side-panels";
import { NoMatchPanel } from "./no-match-panel";
import { EvidenceDrawer } from "./evidence-drawer";
import { ResearchRun } from "./research-run";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const EASE = [0.16, 1, 0.3, 1] as const;

// Explicit placement on wide screens: narrow column left, the match on the right.
// On phones the DOM order wins: shortlist, then the match, then the rest.
const LEFT_ROWS = ["xl:row-start-1", "xl:row-start-2", "xl:row-start-3", "xl:row-start-4", "xl:row-start-5"];
const GRID_ROWS: Record<number, string> = {
  2: "xl:grid-rows-[auto_1fr]",
  3: "xl:grid-rows-[auto_auto_1fr]",
  4: "xl:grid-rows-[auto_auto_auto_1fr]",
  5: "xl:grid-rows-[auto_auto_auto_auto_1fr]",
};
const RIGHT_SPAN: Record<number, string> = {
  2: "xl:row-span-2",
  3: "xl:row-span-3",
  4: "xl:row-span-4",
  5: "xl:row-span-5",
};

/**
 * Preview of the score with the user's own weights, using the backend's component scores.
 * Unknown parts widen the range instead of guessing. TODO(api): the server re-scores on save.
 */
function rescore(m: Match, w: Weights): Match {
  const pct = weightPct(w);
  const sum = Object.values(w).reduce((n, v) => n + v, 0) || 1;
  let low = 0;
  let high = 0;
  for (const c of m.components) {
    const share = w[c.key as FitComponentKey] / sum;
    low += (c.score ?? 0) * share;
    high += (c.score ?? 100) * share;
  }
  return {
    ...m,
    score: { low: Math.round(low), high: Math.round(high) },
    components: m.components.map((c) => ({ ...c, weight: pct[c.key] })),
  };
}
const mid = (m: Match) => (m.score.low + m.score.high) / 2;
const rank = (list: Match[], w: Weights) =>
  list.map((m) => rescore(m, w)).sort((a, b) => mid(b) - mid(a));

/**
 * Discover: a short, explained shortlist per workflow (PRD F03).
 * Ranking, scores and filtering come from the backend; the UI displays them, previews weight
 * changes, and collects choices.
 */
export function DiscoverView({ data }: { data: DiscoverData }) {
  const reduce = useReducedMotionConfig();
  const workflows = [...data.workflows].sort((a, b) => a.priority - b.priority);
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [picked, setPicked] = useState<Record<string, string>>({});
  // TODO(api): POST /api/matches/:id/dismiss and DELETE to undo.
  const [passed, setPassed] = useState<string[]>([]);
  const [saved, setSaved] = useState<Weights>(DEFAULT_WEIGHTS);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [version, setVersion] = useState(data.profileVersion);
  const [note, setNote] = useState<string | null>(null);
  const [researching, setResearching] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<string[]>([]);
  const [source, setSource] = useState<Evidence | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const workflow = workflows.find((w) => w.id === workflowId);
  const name = workflow ? lowerFirst(workflow.name) : "this workflow";
  const all = useMemo(
    () => data.matches.filter((m) => m.workflowId === workflowId),
    [data.matches, workflowId],
  );
  const shortlist = useMemo(
    () => rank(all.filter((m) => !passed.includes(m.id)), weights),
    [all, passed, weights],
  );
  const passedHere = all.filter((m) => passed.includes(m.id));
  const excluded = data.excluded.filter((x) => x.workflowId === workflowId);
  const others = data.others.filter((o) => o.workflowId === workflowId);
  const research = data.research.find((r) => r.workflowId === workflowId);
  const noBetter = data.noBetterMatch.find((n) => n.workflowId === workflowId);
  const selected = shortlist.find((m) => m.id === picked[workflowId]) ?? shortlist[0] ?? null;
  const dirty = JSON.stringify(weights) !== JSON.stringify(saved);
  const isResearching = researching === workflowId;

  const scrollToDetail = () => {
    // On stacked layouts the detail sits below the list; bring it into view.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
      );
    }
  };
  const select = (id: string) => {
    setPicked((p) => ({ ...p, [workflowId]: id }));
    scrollToDetail();
  };

  const saveWeights = () => {
    const before = rank(all.filter((m) => !passed.includes(m.id)), saved).map((m) => m.id);
    const after = shortlist.map((m) => m.id);
    const moved = after.findIndex((id, i) => before[i] !== id);
    const next = version + 1;
    setSaved(weights);
    setVersion(next);
    setNote(
      moved === -1
        ? `Re-ranked with profile version ${next}. Order unchanged.`
        : `Re-ranked with profile version ${next}. ${shortlist[moved].toolName} moved to ${moved + 1}.`,
    );
  };

  // Pages the research re-reads: each shortlisted tool's sources, plus one page behind a login.
  const hosts = useMemo(() => {
    const fromSources = all.flatMap((m) =>
      m.sources.filter((s) => s.kind !== "tested").map((s) => s.source),
    );
    const fromClosest = noBetter?.closest.map((c) => hostFor(c.toolName)) ?? [];
    const list = [...new Set([...fromSources, ...fromClosest])].slice(0, 5).map((host) => ({ host }));
    const first = all[0]?.toolName ?? noBetter?.closest[0]?.toolName;
    return first ? [...list, { host: `${hostFor(first)}/changelog`, blocked: true }] : list;
  }, [all, noBetter]);

  const finishResearch = () => {
    setResearching(null);
    setRefreshed((r) => [...new Set([...r, workflowId])]);
    setNote("Research refreshed. Nothing moved.");
  };
  const stopResearch = () => {
    setResearching(null);
    setNote("Research stopped. Nothing changed.");
  };

  const subtitle = noBetter ? (
    <>
      {noBetter.currentTool} is still your best fit for {name}
    </>
  ) : (
    <>
      <span className="text-text-1">
        {shortlist.length} of {research?.checked ?? all.length} tools
      </span>{" "}
      fit {name} · ranked by fit, never by who pays
    </>
  );

  const left = [
    !noBetter && (
      <ShortlistPanel
        key="shortlist"
        matches={shortlist}
        selectedId={selected?.id ?? null}
        onSelect={select}
        onDismiss={(id) => setPassed((p) => [...p, id])}
        note={note}
      />
    ),
    !noBetter && (
      <WeightsPanel
        key="weights"
        weights={weights}
        open={weightsOpen}
        dirty={dirty}
        onOpen={setWeightsOpen}
        onChange={setWeights}
        onSave={saveWeights}
        onReset={() => setWeights(DEFAULT_WEIGHTS)}
      />
    ),
    <FilteredOutPanel
      key="filtered"
      excluded={excluded}
      passed={passedHere}
      onUndo={(id) => setPassed((p) => p.filter((x) => x !== id))}
    />,
    others.length > 0 && <AlsoCheckedPanel key="others" others={others} />,
    <HowRankedPanel
      key="how"
      research={research}
      refreshedToday={refreshed.includes(workflowId)}
      profileVersion={version}
      researching={isResearching}
      onResearch={() => {
        setNote(null);
        setResearching(workflowId);
        scrollToDetail();
      }}
    />,
  ].filter(Boolean);

  const fade = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.32, ease: EASE } },
    exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.12 } },
  };

  const cell = (i: number) => (
    <div
      key={i}
      className={cn(
        "col-span-12 xl:col-span-4 xl:col-start-1",
        i > 0 && "xl:self-start",
        LEFT_ROWS[i],
      )}
    >
      {left[i]}
    </div>
  );

  const right = (
    <div
      key="right"
      ref={detailRef}
      className={cn(
        "col-span-12 scroll-mt-6 xl:col-span-8 xl:col-start-5 xl:row-start-1",
        RIGHT_SPAN[left.length],
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isResearching ? (
          <motion.div key="research" {...fade}>
            <ResearchRun
              workflowName={name}
              hosts={hosts}
              onDone={finishResearch}
              onStop={stopResearch}
            />
          </motion.div>
        ) : noBetter ? (
          <motion.div key="nomatch" {...fade}>
            <NoMatchPanel result={noBetter} workflowName={name} checked={research?.checked} />
          </motion.div>
        ) : selected ? (
          <motion.div key={selected.id} {...fade}>
            <MatchDetail match={selected} onOpenSource={setSource} />
          </motion.div>
        ) : (
          <motion.div key="empty" {...fade}>
            <AllPassed
              name={name}
              hasPassed={passedHere.length > 0}
              onUndo={() =>
                setPassed((p) => p.filter((id) => !passedHere.some((m) => m.id === id)))
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Discover"
        subtitle={subtitle}
        actions={
          <Segmented
            label="Workflow"
            options={workflows.map((w) => ({ id: w.id, label: w.name }))}
            value={workflowId}
            onChange={(id) => {
              setWorkflowId(id);
              setNote(null);
            }}
          />
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={workflowId}
          {...fade}
          className={cn("grid grid-cols-12 gap-gutter", GRID_ROWS[left.length])}
        >
          {/* DOM order is the phone order: shortlist then the match, or the verdict first. */}
          {noBetter
            ? [right, ...left.map((_, i) => cell(i))]
            : [cell(0), right, ...left.slice(1).map((_, i) => cell(i + 1))]}
        </motion.div>
      </AnimatePresence>

      <EvidenceDrawer evidence={source} onClose={() => setSource(null)} />
    </div>
  );
}

function AllPassed({
  name,
  hasPassed,
  onUndo,
}: {
  name: string;
  hasPassed: boolean;
  onUndo: () => void;
}) {
  return (
    <section className="flex min-h-[320px] flex-col items-start justify-center gap-4 rounded-[20px] border border-line bg-surface-1 px-8 py-10">
      <h2 className="display text-[24px] leading-[30px] font-medium text-text-1">
        {hasPassed ? `You passed on every match for ${name}` : `No matches for ${name} yet`}
      </h2>
      {hasPassed && (
        <Button variant="secondary" onClick={onUndo}>
          Bring them back
        </Button>
      )}
    </section>
  );
}
