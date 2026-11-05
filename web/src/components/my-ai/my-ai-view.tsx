"use client";

import { useCallback, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import type { Profile, Subscription } from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { Money } from "@/components/kit/money";
import { Button } from "@/components/ui/button";
import { ToolsCollection, type ToolsView } from "./tools-collection";
import { ToolDrawer } from "./tool-drawer";
import { WorkflowsPanel } from "./workflows-panel";
import { ProfilePanel } from "./profile-panel";

type View = ToolsView;

/** My AI: the wallet of tools (cards or table), workflows, and the profile. Edits are local until the API lands. */
export function MyAiView({
  initial,
  profile,
  today,
}: {
  initial: Subscription[];
  profile: Profile;
  today: string;
}) {
  const [subs, setSubs] = useState(initial);
  const [view, setView] = useState<View>("cards");
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const shown = subs.filter((s) => s.status !== "archived");
  // Display only. TODO(api): the backend returns the authoritative total.
  const total = shown
    .filter((s) => s.status === "active")
    .reduce((n, s) => n + (s.monthlyCents ?? 0), 0);
  const unknown = shown.filter((s) => s.monthlyCents === null).length;

  const openTool = (s: Subscription | null) => {
    setEditing(s);
    setDrawerOpen(true);
  };
  const close = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="My AI"
        subtitle={
          <>
            {shown.length} tools ·{" "}
            <Money cents={total} className="text-text-1" /> a month
            {unknown > 0 && (
              <span className="text-text-3"> · {unknown} price unknown</span>
            )}
          </>
        }
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { id: "cards", label: "Cards" },
                { id: "table", label: "Table" },
              ]}
            />
            <Button variant="primary" onClick={() => openTool(null)}>
              <Plus size={16} weight="bold" /> Add a tool
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12">
          <ToolsCollection
            subs={shown}
            view={view}
            today={today}
            onOpen={(s) => openTool(s)}
            onAdd={() => openTool(null)}
          />
        </div>

        {/* Lean right: narrow workflows left, the profile right */}
        <div className="col-span-12 xl:col-span-4">
          <WorkflowsPanel workflows={profile.workflows} />
        </div>
        <div className="col-span-12 xl:col-span-8">
          <ProfilePanel profile={profile} />
        </div>
      </div>

      <ToolDrawer
        open={drawerOpen}
        tool={editing}
        onClose={close}
        onSave={(s) => {
          setSubs((prev) =>
            prev.some((p) => p.id === s.id)
              ? prev.map((p) => (p.id === s.id ? s : p))
              : [...prev, s],
          );
          setDrawerOpen(false);
        }}
        onRemove={(id) => {
          setSubs((prev) => prev.filter((p) => p.id !== id));
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}
