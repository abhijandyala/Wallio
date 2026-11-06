"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { Plus } from "@phosphor-icons/react";
import type { Profile, ProfileField, Subscription, Workflow } from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { Money } from "@/components/kit/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateSettings, useSettings } from "@/lib/settings";
import { ToolsCollection, type ToolsSort, type ToolsView } from "./tools-collection";
import { ToolsEmpty } from "./tools-empty";
import { ToolDrawer } from "./tool-drawer";
import { WorkflowsPanel } from "./workflows-panel";
import { ProfilePanel } from "./profile-panel";

const fromGitHub = (f: ProfileField) => f.inferredFrom?.startsWith("GitHub") ?? false;
const dollarsToCents = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** What the live wrapper (my-ai-live.tsx) hands the view when the data comes from the API. */
export type MyAiLive = {
  /** Catalog tools you can add (the API only takes catalog tools). */
  catalog: { id: string; name: string; category: string }[];
  /** From the server's inventory summary. The view never adds prices up when live. */
  totalCents: number | null;
  unknownCount: number;
  budgetCents: number;
  saveTool: (s: Subscription, isNew: boolean) => Promise<Subscription>;
  setStatus: (id: string, status: Subscription["status"]) => Promise<Subscription>;
  /** Saves the facts and workflows as a new profile version and returns its number. */
  saveProfile: (fields: ProfileField[], workflows: Workflow[]) => Promise<number>;
};

/**
 * My AI: the wallet of tools, the workflows they serve, and the profile.
 * With `live`, every change is saved to the Wallio API and the totals are the server's;
 * without it (the API can't be reached) it runs on sample data, locally.
 */
export function MyAiView({
  initial,
  profile,
  today,
  live,
}: {
  initial: Subscription[];
  profile: Profile;
  today: string;
  live?: MyAiLive;
}) {
  const reduce = useReducedMotionConfig();
  const [subs, setSubs] = useState(initial);
  const settings = useSettings();
  // null = use the default from Settings -> Display; a click here overrides it for this visit.
  const [viewPick, setView] = useState<ToolsView | null>(null);
  const view = viewPick ?? settings.myAiView;
  const [sort, setSort] = useState<ToolsSort>("default");
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [preset, setPreset] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [removed, setRemoved] = useState<{ sub: Subscription; index: number } | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>(profile.workflows);
  const [fields, setFields] = useState<ProfileField[]>(profile.fields);
  const [version, setVersion] = useState(profile.version);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [toolError, setToolError] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState(false);

  const shown = subs.filter((s) => s.status !== "archived");
  const ordered = sortTools(shown, sort);
  // Live: the server's total. Sample: a display-only sum.
  const total = live
    ? (live.totalCents ?? 0)
    : shown.filter((s) => s.status === "active").reduce((n, s) => n + (s.monthlyCents ?? 0), 0);
  const unknown = shown.filter((s) => s.monthlyCents === null);
  const unknownCount = live ? live.unknownCount : unknown.length;
  // Live: the profile's budget. Sample: the one in Settings.
  const budget = live ? live.budgetCents : settings.budgetCents;
  const visibleFields = fields
    .filter(
      (f) =>
        !(f.status === "pending" && fromGitHub(f) && (!settings.githubConnected || !settings.allowGuesses)),
    )
    .map((f) =>
      !live && f.id === "pf_budget" ? { ...f, value: "$" + (budget / 100).toLocaleString("en-US") } : f,
    );

  const openTool = (s: Subscription | null, name?: string) => {
    setToolError(null);
    setEditing(s);
    setPreset(name);
    setDrawerOpen(true);
  };
  const close = useCallback(() => setDrawerOpen(false), []);

  /** Applies a profile change and, when live, saves it as a new version (undoing it if refused). */
  const commitProfile = async (nextFields: ProfileField[], nextWorkflows: Workflow[]) => {
    const prev = { fields, workflows };
    setFields(nextFields);
    setWorkflows(nextWorkflows);
    if (!live) {
      const next = version + 1;
      setVersion(next);
      setSavedNote(`Saved as version ${next}. Discover will re-rank with it.`);
      return;
    }
    setSavedNote("Saving…");
    try {
      const v = await live.saveProfile(nextFields, nextWorkflows);
      setVersion(v);
      setSavedNote(`Saved as version ${v}. New comparisons use it.`);
    } catch (e) {
      setFields(prev.fields);
      setWorkflows(prev.workflows);
      setSavedNote(e instanceof Error ? `Not saved: ${e.message}` : "Not saved.");
    }
  };

  const saveTool = async (s: Subscription) => {
    const isNew = !subs.some((p) => p.id === s.id);
    if (!live) {
      setSubs((prev) => (isNew ? [...prev, s] : prev.map((p) => (p.id === s.id ? s : p))));
      setDrawerOpen(false);
      return;
    }
    setToolBusy(true);
    setToolError(null);
    try {
      const saved = await live.saveTool(s, isNew);
      setSubs((prev) => (isNew ? [...prev, saved] : prev.map((p) => (p.id === s.id ? saved : p))));
      setDrawerOpen(false);
    } catch (e) {
      setToolError(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setToolBusy(false);
    }
  };

  const removeTool = async (id: string) => {
    const index = subs.findIndex((p) => p.id === id);
    if (index < 0) return;
    if (live) {
      setToolBusy(true);
      setToolError(null);
      try {
        await live.setStatus(id, "archived");
      } catch (e) {
        setToolError(e instanceof Error ? e.message : "Couldn't remove it.");
        setToolBusy(false);
        return;
      }
      setToolBusy(false);
    }
    setRemoved({ sub: subs[index], index });
    setSubs((prev) => prev.filter((p) => p.id !== id));
    setDrawerOpen(false);
  };

  const undoRemove = async () => {
    if (!removed) return;
    const { sub, index } = removed;
    setRemoved(null);
    if (live) {
      try {
        await live.setStatus(sub.id, sub.status === "archived" ? "active" : sub.status);
      } catch {
        return;
      }
    }
    setSubs((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, sub);
      return next;
    });
  };

  // The undo offer fades after a few seconds.
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(t);
  }, [removed]);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="My AI"
        subtitle={
          shown.length === 0 ? (
            "No tools yet"
          ) : (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>{shown.length} tools ·</span>
              <Money cents={total} className="text-text-1" />
              <span>a month</span>
              <BudgetMeter spent={total} budget={budget} warnAtPct={settings.warnAtPct} />
              {unknownCount > 0 && (
                <button
                  type="button"
                  onClick={() => unknown[0] && openTool(unknown[0])}
                  className="rounded-md text-text-3 underline-offset-4 transition-colors hover:text-text-1 hover:underline"
                >
                  · {unknownCount} price unknown
                </button>
              )}
            </span>
          )
        }
        actions={
          <>
            {shown.length > 0 && (
              <Segmented
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { id: "cards", label: "Cards" },
                  { id: "table", label: "Table" },
                ]}
              />
            )}
            <Button variant="primary" onClick={() => openTool(null)}>
              <Plus size={16} weight="bold" /> Add a tool
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12">
          {shown.length === 0 ? (
            <ToolsEmpty onAdd={(name) => openTool(null, name)} />
          ) : (
            <ToolsCollection
              subs={ordered}
              view={view}
              sort={sort}
              onSort={setSort}
              workflows={workflows}
              today={today}
              onOpen={(s) => openTool(s)}
              onAdd={() => openTool(null)}
            />
          )}
        </div>

        {/* Lean right: workflows narrow on the left, the profile wide on the right. (Connections are
            hidden: the API has no /api/connections yet.) */}
        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-4">
          <WorkflowsPanel
            workflows={workflows}
            tools={shown.map((s) => s.toolName)}
            onSave={(next) => void commitProfile(fields, next)}
          />
        </div>
        <div className="col-span-12 xl:col-span-8">
          <ProfilePanel
            fields={visibleFields}
            version={version}
            savedNote={savedNote}
            onConfirm={(id) =>
              void commitProfile(
                fields.map((f) => (f.id === id ? { ...f, status: "confirmed" } : f)),
                workflows,
              )
            }
            onRemove={(id) => void commitProfile(fields.filter((f) => f.id !== id), workflows)}
            onEdit={(id, value) => {
              if (id === "pf_budget") {
                const cents = dollarsToCents(value);
                if (cents !== null && cents > 0) updateSettings({ budgetCents: cents });
              }
              void commitProfile(
                fields.map((f) => (f.id === id ? { ...f, value, source: "stated", status: "confirmed" } : f)),
                workflows,
              );
            }}
          />
        </div>
      </div>

      <ToolDrawer
        open={drawerOpen}
        tool={editing}
        presetName={preset}
        catalog={live ? live.catalog.filter((t) => editing?.toolId === t.id || !shown.some((s) => s.toolId === t.id)) : undefined}
        busy={toolBusy}
        error={toolError}
        onClose={close}
        onSave={(s) => void saveTool(s)}
        onRemove={(id) => void removeTool(id)}
      />

      {/* Undo after removing a tool. */}
      <AnimatePresence>
        {removed && (
          <motion.div
            key={removed.sub.id}
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 12 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-4 rounded-[12px] border border-line-strong bg-surface-3 py-2.5 pr-2.5 pl-4 text-[14px] text-text-1"
          >
            Removed {removed.sub.toolName}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void undoRemove()}
            >
              Undo
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sorting is display order only. Unknown prices and dates always sort last, never as 0. */
function sortTools(list: Subscription[], sort: ToolsSort) {
  if (sort === "default") return list;
  const copy = [...list];
  if (sort === "price")
    copy.sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1));
  if (sort === "renewal")
    copy.sort((a, b) => (a.renewsOn ?? "9999").localeCompare(b.renewsOn ?? "9999"));
  return copy;
}

function BudgetMeter({ spent, budget, warnAtPct }: { spent: number; budget: number; warnAtPct: number }) {
  const pct = Math.min(100, (spent / Math.max(budget, 1)) * 100);
  // Aurora from the warning line set in Settings -> Spending. Never red: it isn't an error.
  const over = pct >= warnAtPct;
  return (
    <span className="flex items-center gap-2">
      <span>of</span>
      <Money cents={budget} dropCents className="text-text-1" />
      <span
        className="h-1.5 w-16 overflow-hidden rounded-[2px] bg-surface-3"
        role="meter"
        aria-label="Budget used"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className={cn("block h-full rounded-[2px]", over ? "bg-aurora" : "bg-lime")}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}
