"use client";

import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { ArrowRight, Check, ShieldCheck, X } from "@phosphor-icons/react";
import type { CompareSetupData } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Segmented } from "@/components/kit/segmented";
import { ChoiceList } from "@/components/kit/choice-list";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { List, ListItem } from "@/components/kit/list";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SetupChoice {
  workflowId: string;
  taskId: string;
  tools: string[];
}

type Tool = CompareSetupData["tools"][number];

/** Default matchup for a workflow: your tool against the best candidate. */
export function defaultChoice(
  data: CompareSetupData,
  workflowId: string,
): SetupChoice {
  const tools = data.tools.filter((t) => t.workflowIds.includes(workflowId));
  const mine = tools.find((t) => t.isCurrent);
  const other = tools.find((t) => !t.isCurrent && t !== mine);
  return {
    workflowId,
    taskId: data.tasks.find((t) => t.workflowId === workflowId)?.id ?? "",
    tools: [mine, other].filter(Boolean).map((t) => t!.name),
  };
}

export function CompareSetup({
  data,
  choice,
  onChange,
  capCents,
  onCap,
  onStart,
  onContainment,
}: {
  data: CompareSetupData;
  choice: SetupChoice;
  onChange: (c: SetupChoice) => void;
  /** Spend cap for the run (inference + runner). The server also enforces its own ceiling. */
  capCents: number;
  onCap: (c: number) => void;
  onStart: () => void;
  onContainment: () => void;
}) {
  const tasks = data.tasks.filter((t) => t.workflowId === choice.workflowId);
  const tools = data.tools.filter((t) =>
    t.workflowIds.includes(choice.workflowId),
  );
  const picked = choice.tools
    .map((n) => data.tools.find((t) => t.name === n))
    .filter(Boolean) as Tool[];
  const ready = picked.length === 2 && tasks.some((t) => t.id === choice.taskId);

  const toggle = (name: string) => {
    if (choice.tools.includes(name))
      return onChange({ ...choice, tools: choice.tools.filter((t) => t !== name) });
    if (choice.tools.length >= 2) return;
    onChange({ ...choice, tools: [...choice.tools, name] });
  };

  return (
    <div className="grid grid-cols-12 gap-gutter xl:grid-rows-[auto_1fr]">
      {/* The builder. First in the DOM so phones start here; on wide screens it sits right. */}
      <section className="col-span-12 flex flex-col rounded-[20px] border border-line bg-surface-1 xl:col-span-8 xl:col-start-5 xl:row-span-2 xl:row-start-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 p-4 sm:gap-4 sm:p-6">
          <Slot tool={picked[0]} onRemove={toggle} />
          <span className="grid size-9 place-items-center rounded-[8px] bg-surface-3 text-[13px] text-text-3">
            vs
          </span>
          <Slot tool={picked[1]} onRemove={toggle} />
        </div>

        <Row label="Workflow">
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Segmented
              label="Workflow"
              options={data.workflows.map((w) => ({ id: w.id, label: w.name }))}
              value={choice.workflowId}
              onChange={(id) => onChange(defaultChoice(data, id))}
            />
          </div>
        </Row>

        <div className="border-t border-line">
          <p className="px-6 pt-4 text-[13px] text-text-3">Task · runs on sample data</p>
          <ChoiceList
            name="task"
            type="radio"
            legend="Task"
            options={tasks.map((t) => ({
              id: t.id,
              label: t.title,
            }))}
            value={[choice.taskId]}
            onChange={([id]) => onChange({ ...choice, taskId: id })}
          />
        </div>

        <div className="border-t border-line px-6 py-5">
          <p className="mb-3 text-[13px] text-text-3">
            Tools <span className="text-text-3">· pick two</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tools.map((t) => {
              const on = choice.tools.includes(t.name);
              const full = !on && choice.tools.length >= 2;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => toggle(t.name)}
                  disabled={full}
                  aria-pressed={on}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-[12px] border border-line px-4 text-left transition-[color,opacity] duration-200",
                    full && "opacity-40",
                  )}
                >
                  <ToolMark name={t.name} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      on ? "text-text-1" : "text-text-2",
                    )}
                  >
                    {t.name}
                  </span>
                  {t.isCurrent && (
                    <span className="shrink-0 text-[13px] text-text-3">
                      Yours
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[18px] shrink-0 place-items-center rounded-[4px] border transition-colors duration-200",
                      on
                        ? "border-lavender bg-lavender text-ink"
                        : "border-line-strong",
                    )}
                  >
                    {on && <Check size={11} weight="bold" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Row label="Spend cap">
          <Segmented
            label="Spend cap"
            value={String(capCents)}
            onChange={(v) => onCap(Number(v))}
            options={[
              { id: "25", label: "$0.25" },
              { id: "50", label: "$0.50" },
              { id: "100", label: "$1.00" },
            ]}
          />
        </Row>

        <footer className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-6 py-5">
          <span className="tnum text-[13px] text-text-3">
            3 runs each · about 2 minutes · est. $0.13, reserved when it starts
          </span>
          <Button
            variant="primary"
            size="lg"
            className="ml-auto max-sm:w-full"
            disabled={!ready}
            onClick={onStart}
          >
            {ready ? "Start comparison" : "Pick two tools"}
            {ready && <ArrowRight size={16} weight="bold" />}
          </Button>
        </footer>
      </section>

      <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-1">
        <Panel title="How it stays contained" flush>
          <KeyValue className="border-t border-line">
            <KeyValueRow label="Runs in">A fresh sandbox</KeyValueRow>
            <KeyValueRow label="Can visit">Only the two tools&apos; sites</KeyValueRow>
            <KeyValueRow label="Your data">Sample repo, no keys</KeyValueRow>
            <KeyValueRow label="Limits">
              <span className="tnum">20 actions · 180s</span>
            </KeyValueRow>
            <KeyValueRow label="Afterwards">Sandbox destroyed</KeyValueRow>
          </KeyValue>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
            <Button variant="secondary" size="sm" onClick={onContainment}>
              <ShieldCheck size={14} /> Run the containment test
            </Button>
            <span className="text-[12px] text-text-3">Our hostile page, about 15 seconds</span>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-2 xl:self-start">
        <Panel title="Recent" flush>
          <List className="border-t border-line">
            {data.recent.map((r) => (
              <ListItem
                key={r.id}
                title={r.title}
                meta={`${r.outcome} · ${r.finishedOn}`}
                href={r.href}
              />
            ))}
          </List>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="shrink-0 text-[13px] text-text-3">{label}</span>
      {children}
    </div>
  );
}

/** One side of the matchup. Swaps with a short fade when the pick changes. */
function Slot({
  tool,
  onRemove,
}: {
  tool: Tool | undefined;
  onRemove: (name: string) => void;
}) {
  const reduce = useReducedMotionConfig();
  return (
    <div className="relative h-[120px] sm:h-[136px]">
      <AnimatePresence mode="popLayout" initial={false}>
        {tool ? (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col justify-between rounded-[16px] border border-line bg-surface-2 p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-3">
                <ToolMark name={tool.name} size="lg" />
                <span className="hidden truncate text-[17px] font-medium text-text-1 sm:block">
                  {tool.name}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(tool.name)}
                aria-label={`Remove ${tool.name}`}
                className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] text-text-3">
                <span className="text-text-1 sm:hidden">{tool.name}</span>
                <span className="hidden sm:inline">
                  {tool.isCurrent ? "In your stack" : "Candidate"}
                </span>
              </span>
              <span className="display hidden shrink-0 text-[20px] font-medium text-text-1 sm:block">
                {tool.monthlyCents === 0 ? (
                  "Free"
                ) : (
                  <>
                    <Money cents={tool.monthlyCents} dropCents />
                    <span className="ml-0.5 text-[13px] font-normal tracking-normal text-text-3">
                      /mo
                    </span>
                  </>
                )}
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="absolute inset-0 grid place-items-center rounded-[16px] border border-dashed border-line-strong text-center text-[13px] text-text-3"
          >
            Pick a tool
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
