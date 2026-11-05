"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DiscoverData } from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MatchDetail } from "./match-detail";
import { FilteredOutPanel, HowRankedPanel, ShortlistPanel } from "./side-panels";
import { NoMatchPanel } from "./no-match-panel";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const EASE = [0.16, 1, 0.3, 1] as const;

// Explicit placement on wide screens: narrow column left, the match on the right.
// On phones the DOM order wins: shortlist, then the match, then the rest.
const LEFT_ROWS = ["xl:row-start-1", "xl:row-start-2", "xl:row-start-3"];

/**
 * Discover: a short, explained shortlist per workflow (PRD F03).
 * Ranking, scores and filtering come from the backend; the UI only displays and collects choices.
 */
export function DiscoverView({ data }: { data: DiscoverData }) {
  const reduce = useReducedMotion();
  const workflows = [...data.workflows].sort((a, b) => a.priority - b.priority);
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [picked, setPicked] = useState<Record<string, string>>({});
  // TODO(api): POST /api/matches/:id/dismiss and DELETE to undo.
  const [passed, setPassed] = useState<string[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);

  const workflow = workflows.find((w) => w.id === workflowId);
  const name = workflow ? lowerFirst(workflow.name) : "this workflow";
  const all = data.matches.filter((m) => m.workflowId === workflowId);
  const shortlist = all.filter((m) => !passed.includes(m.id));
  const passedHere = all.filter((m) => passed.includes(m.id));
  const excluded = data.excluded.filter((x) => x.workflowId === workflowId);
  const research = data.research.find((r) => r.workflowId === workflowId);
  const noBetter = data.noBetterMatch.find((n) => n.workflowId === workflowId);
  const selected =
    shortlist.find((m) => m.id === picked[workflowId]) ?? shortlist[0] ?? null;

  const select = (id: string) => {
    setPicked((p) => ({ ...p, [workflowId]: id }));
    // On stacked layouts the detail sits below the list; bring it into view.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        }),
      );
    }
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
      />
    ),
    <FilteredOutPanel
      key="filtered"
      excluded={excluded}
      passed={passedHere}
      onUndo={(id) => setPassed((p) => p.filter((x) => x !== id))}
    />,
    <HowRankedPanel key="how" research={research} />,
  ].filter(Boolean);

  const firstLeft = (
    <div className={cn("col-span-12 xl:col-span-4 xl:col-start-1", LEFT_ROWS[0])}>
      {left[0]}
    </div>
  );

  const fade = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.32, ease: EASE },
    },
    exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.12 } },
  };

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
            onChange={setWorkflowId}
          />
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={workflowId}
          {...fade}
          className={cn(
            "grid grid-cols-12 gap-gutter",
            left.length === 3
              ? "xl:grid-rows-[auto_auto_1fr]"
              : "xl:grid-rows-[auto_1fr]",
          )}
        >
          {/* DOM order is the phone order: shortlist then the match, or the verdict first when nothing beats your tool. */}
          {!noBetter && firstLeft}
          <div
            ref={detailRef}
            className="col-span-12 scroll-mt-6 xl:col-span-8 xl:col-start-5 xl:row-span-3 xl:row-start-1"
          >
            {noBetter ? (
              <NoMatchPanel
                result={noBetter}
                workflowName={name}
                checked={research?.checked}
              />
            ) : selected ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={selected.id} {...fade}>
                  <MatchDetail
                    match={selected}
                    onDismiss={() => setPassed((p) => [...p, selected.id])}
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <AllPassed
                name={name}
                hasPassed={passedHere.length > 0}
                onUndo={() =>
                  setPassed((p) => p.filter((id) => !passedHere.some((m) => m.id === id)))
                }
              />
            )}
          </div>

          {noBetter && firstLeft}
          {left.slice(1).map((panel, i) => (
            <div
              key={i}
              className={cn(
                "col-span-12 xl:col-span-4 xl:col-start-1 xl:self-start",
                LEFT_ROWS[i + 1],
              )}
            >
              {panel}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
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
        {hasPassed
          ? `You passed on every match for ${name}`
          : `No matches for ${name} yet`}
      </h2>
      {hasPassed && (
        <Button variant="secondary" onClick={onUndo}>
          Bring them back
        </Button>
      )}
    </section>
  );
}
