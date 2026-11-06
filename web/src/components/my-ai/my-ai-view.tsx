"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { Plus } from "@phosphor-icons/react";
import type { Connection, Profile, ProfileField, Subscription, Workflow } from "@/lib/types";
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
import { ConnectionsPanel } from "./connections-panel";
import { ProfilePanel } from "./profile-panel";

const fromGitHub = (f: ProfileField) => f.inferredFrom?.startsWith("GitHub") ?? false;
const dollarsToCents = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * My AI: the wallet of tools, the workflows they serve, what Wallio reads, and the profile.
 * Edits are local until the API lands. Totals here are display-only; the backend owns them.
 * TODO(api): GET /api/inventory, GET /api/profile, GET /api/connections.
 */
export function MyAiView({
  initial,
  profile,
  connections,
  today,
}: {
  initial: Subscription[];
  profile: Profile;
  connections: Connection[];
  today: string;
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
  const disconnected = settings.githubConnected ? [] : ["con_github"];

  const shown = subs.filter((s) => s.status !== "archived");
  const ordered = sortTools(shown, sort);
  // Display only. TODO(api): the backend returns the authoritative total.
  const total = shown
    .filter((s) => s.status === "active")
    .reduce((n, s) => n + (s.monthlyCents ?? 0), 0);
  const unknown = shown.filter((s) => s.monthlyCents === null);
  // The budget lives in Settings; the profile fact shows the same number.
  const budget = settings.budgetCents;
  const visibleFields = fields
    .filter(
      (f) =>
        !(f.status === "pending" && fromGitHub(f) && (!settings.githubConnected || !settings.allowGuesses)),
    )
    .map((f) =>
      f.id === "pf_budget" ? { ...f, value: "$" + (budget / 100).toLocaleString("en-US") } : f,
    );

  const openTool = (s: Subscription | null, name?: string) => {
    setEditing(s);
    setPreset(name);
    setDrawerOpen(true);
  };
  const close = useCallback(() => setDrawerOpen(false), []);

  const bump = () => {
    const next = version + 1;
    setVersion(next);
    setSavedNote(`Saved as version ${next}. Discover will re-rank with it.`);
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
              {unknown.length > 0 && (
                <button
                  type="button"
                  onClick={() => openTool(unknown[0])}
                  className="rounded-md text-text-3 underline-offset-4 transition-colors hover:text-text-1 hover:underline"
                >
                  · {unknown.length} price unknown
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

        {/* Lean right: workflows and connections narrow on the left, the profile wide on the right. */}
        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-4">
          <WorkflowsPanel
            workflows={workflows}
            tools={shown.map((s) => s.toolName)}
            onSave={(next) => {
              setWorkflows(next);
              bump();
            }}
          />
          <ConnectionsPanel
            connections={connections}
            disconnected={disconnected}
            onToggle={(id) => {
              if (id === "con_github") updateSettings({ githubConnected: !settings.githubConnected });
            }}
          />
        </div>
        <div className="col-span-12 xl:col-span-8">
          <ProfilePanel
            fields={visibleFields}
            version={version}
            savedNote={savedNote}
            onConfirm={(id) => {
              setFields((p) => p.map((f) => (f.id === id ? { ...f, status: "confirmed" } : f)));
              bump();
            }}
            onRemove={(id) => {
              setFields((p) => p.filter((f) => f.id !== id));
              bump();
            }}
            onEdit={(id, value) => {
              if (id === "pf_budget") {
                const cents = dollarsToCents(value);
                if (cents !== null && cents > 0) updateSettings({ budgetCents: cents });
              }
              setFields((p) =>
                p.map((f) => (f.id === id ? { ...f, value, source: "stated", status: "confirmed" } : f)),
              );
              bump();
            }}
          />
        </div>
      </div>

      <ToolDrawer
        open={drawerOpen}
        tool={editing}
        presetName={preset}
        onClose={close}
        onSave={(s) => {
          setSubs((prev) =>
            prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s],
          );
          setDrawerOpen(false);
        }}
        onRemove={(id) => {
          const index = subs.findIndex((p) => p.id === id);
          if (index >= 0) setRemoved({ sub: subs[index], index });
          setSubs((prev) => prev.filter((p) => p.id !== id));
          setDrawerOpen(false);
        }}
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
              onClick={() => {
                const { sub, index } = removed;
                setSubs((prev) => {
                  const next = [...prev];
                  next.splice(Math.min(index, next.length), 0, sub);
                  return next;
                });
                setRemoved(null);
              }}
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
