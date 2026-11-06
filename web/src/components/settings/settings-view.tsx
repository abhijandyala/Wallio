"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { ArrowRight, Check, DownloadSimple, GithubLogo, Warning } from "@phosphor-icons/react";
import { DEFAULT_SETTINGS, resetSettings, updateSettings, useSettings, type Settings } from "@/lib/settings";
import { homeSample } from "@/mocks/home";
import { profileSample } from "@/mocks/my-ai";
import { decisionsSample } from "@/mocks/decisions";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { Meter } from "@/components/kit/meter";
import { Button } from "@/components/ui/button";
import { daysUntil, formatMoney, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ChipList,
  FixedRow,
  Group,
  LaterRow,
  MultiPick,
  Row,
  Section,
  Select,
  TextField,
  TimeField,
  Toggle,
} from "./controls";

/*
 * Sections are ordered by how often people need them: money and the agent's limits first,
 * then alerts and connections, then profile, account and display, with data controls and the
 * danger zone last (PRD Settings: budgets, integrations, notifications, privacy, export, deletion).
 */
const NAV = [
  { id: "spending", label: "Spending" },
  { id: "agent", label: "Agent and runs" },
  { id: "notifications", label: "Notifications" },
  { id: "connections", label: "Connections" },
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
  { id: "privacy", label: "Privacy and data" },
  { id: "demo", label: "Demo" },
];

const money0 = (c: number) => formatMoney(c).replace(/\.00$/, "");
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const DAYS = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
] as const;

export function SettingsView() {
  const s = useSettings();
  const reduce = useReducedMotionConfig();
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [active, setActive] = useState(NAV[0].id);

  const say = (text: string) => setToast({ id: Date.now(), text });
  const set = (patch: Partial<Settings>, text = "Saved") => {
    updateSettings(patch);
    say(text);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Highlight the section in view in the side nav.
  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader title="Settings" subtitle="Saved on this device until your account is connected." />

      {s.deletionScheduledFor && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] border border-danger/40 bg-danger/10 px-5 py-3"
        >
          <Warning size={16} className="text-danger" />
          <span className="text-text-1">
            Your account will be deleted on {formatShortDate(s.deletionScheduledFor)}.
          </span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => set({ deletionScheduledFor: null }, "Deletion cancelled")}>
            Cancel deletion
          </Button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-gutter">
        {/* Narrow nav on the left; it follows you as you scroll. */}
        <nav aria-label="Settings sections" className="hidden xl:col-span-3 xl:block">
          <ul className="sticky top-6 flex flex-col rounded-[20px] border border-line bg-surface-1 py-2">
            {NAV.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById(n.id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
                  }
                  className={cn(
                    "flex h-10 w-full items-center gap-3 px-6 text-left text-[14px] transition-colors",
                    active === n.id ? "text-text-1" : "text-text-3 hover:text-text-1",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-[1px] transition-colors", active === n.id ? "bg-lavender" : "bg-transparent")}
                  />
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-9">
          <SpendingSection s={s} set={set} />
          <AgentSection s={s} set={set} />
          <NotificationsSection s={s} set={set} say={say} />
          <ConnectionsSection s={s} set={set} />
          <ProfileSection s={s} set={set} />
          <AccountSection s={s} set={set} />
          <DisplaySection s={s} set={set} />
          <PrivacySection s={s} set={set} say={say} />
          <DemoSection s={s} set={set} say={say} />
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 10 }}
            transition={{ duration: 0.2 }}
            role="status"
            className="fixed bottom-6 left-1/2 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-3 px-4 py-2.5 text-[14px] text-text-1"
          >
            <Check size={14} weight="bold" className="shrink-0 text-lime" />
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type P = { s: Settings; set: (patch: Partial<Settings>, text?: string) => void };

/* ── Spending ─────────────────────────────────────────────────────────── */

function SpendingSection({ s, set }: P) {
  const spent = homeSample.totals.monthlyCents;
  const pct = Math.round((spent / Math.max(s.budgetCents, 1)) * 100);
  const next = useMemo(
    () =>
      homeSample.subscriptions
        .filter((x) => x.renewsOn && daysUntil(x.renewsOn, homeSample.today) >= 0)
        .sort((a, b) => a.renewsOn!.localeCompare(b.renewsOn!))[0],
    [],
  );
  const nextDays = next?.renewsOn ? daysUntil(next.renewsOn, homeSample.today) : null;

  return (
    <Section id="spending" title="Spending">
      <Row label="Monthly AI budget" htmlFor="budget">
        <TextField
          id="budget"
          label="Monthly AI budget"
          prefix="$"
          width="w-32"
          inputMode="decimal"
          value={String(s.budgetCents / 100)}
          validate={(v) => {
            const n = Number(v.replace(/[$,]/g, ""));
            return Number.isFinite(n) && n > 0 && n < 100000 ? null : "Enter an amount above $0";
          }}
          onSave={(v) => set({ budgetCents: Math.round(Number(v.replace(/[$,]/g, "")) * 100) }, "Budget saved")}
        />
      </Row>
      <div className="flex flex-col gap-2 border-t border-line px-6 py-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-text-3">This month</span>
          <span className={cn("tnum", pct >= s.warnAtPct ? "text-lavender" : "text-text-1")}>
            {money0(spent)} of {money0(s.budgetCents)} · {pct}%
            {pct >= s.warnAtPct && " · over your warning line"}
          </span>
        </div>
        <Meter value={pct} label="Budget used" />
      </div>
      <Row label="Warn me when spending reaches">
        <Segmented
          label="Warning line"
          value={String(s.warnAtPct)}
          onChange={(v) => set({ warnAtPct: Number(v) })}
          options={["70", "80", "90", "100"].map((v) => ({ id: v, label: `${v}%` }))}
        />
      </Row>
      <Row label="Remind me before a renewal">
        <Segmented
          label="Renewal reminder"
          value={String(s.renewalLeadDays)}
          onChange={(v) => set({ renewalLeadDays: Number(v) })}
          options={["3", "7", "14", "30"].map((v) => ({ id: v, label: `${v} days` }))}
        />
      </Row>
      {next && nextDays !== null && (
        <p className="border-t border-line px-6 py-3 text-[13px] text-text-3">
          Next: {next.toolName} renews in {nextDays} days.{" "}
          <span className={nextDays <= s.renewalLeadDays ? "text-lavender" : ""}>
            {nextDays <= s.renewalLeadDays ? "Inside your reminder window." : "Outside your reminder window."}
          </span>
        </p>
      )}
      <Row label="Show yearly plans as">
        <Segmented
          label="Yearly plans"
          value={s.annualDisplay}
          onChange={(v) => set({ annualDisplay: v })}
          options={[
            { id: "monthly", label: "Monthly cost" },
            { id: "actual", label: "Yearly charge" },
          ]}
        />
      </Row>
      <LaterRow label="Include tax in prices" />
    </Section>
  );
}

/* ── Agent and runs ───────────────────────────────────────────────────── */

function AgentSection({ s, set }: P) {
  return (
    <Section id="agent" title="Agent and runs">
      <Row label="Spend cap for each run">
        <Segmented
          label="Spend cap"
          value={String(s.runCapCents)}
          onChange={(v) => set({ runCapCents: Number(v) }, "New runs start with this cap")}
          options={[
            { id: "25", label: "$0.25" },
            { id: "50", label: "$0.50" },
            { id: "100", label: "$1.00" },
          ]}
        />
      </Row>
      <Row label="Run spending limit per month">
        <Segmented
          label="Monthly run limit"
          value={String(s.monthlyRunLimitCents)}
          onChange={(v) => set({ monthlyRunLimitCents: Number(v) })}
          options={[
            { id: "200", label: "$2" },
            { id: "500", label: "$5" },
            { id: "1000", label: "$10" },
          ]}
        />
      </Row>
      <div className="flex flex-col gap-2 border-t border-line px-6 py-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-text-3">Runs this month</span>
          <span className="tnum text-text-1">
            $0.13 of {money0(s.monthlyRunLimitCents)}
          </span>
        </div>
        <Meter value={(13 / s.monthlyRunLimitCents) * 100} label="Run spending used" />
      </div>
      <Row label="An approval stays valid for">
        <Segmented
          label="Approval window"
          value={String(s.approvalValidMins)}
          onChange={(v) => set({ approvalValidMins: Number(v) })}
          options={[
            { id: "15", label: "15 min" },
            { id: "60", label: "1 hour" },
            { id: "1440", label: "24 hours" },
          ]}
        />
      </Row>
      <Row label="Research my tools again this many days before they renew">
        {s.reResearchBeforeRenewal && (
          <Segmented
            label="Days before renewal"
            value={String(s.reResearchDays)}
            onChange={(v) => set({ reResearchDays: Number(v) })}
            options={["3", "7", "14"].map((v) => ({ id: v, label: `${v} days` }))}
          />
        )}
        <Toggle
          label="Research before renewals"
          checked={s.reResearchBeforeRenewal}
          onChange={(v) => set({ reResearchBeforeRenewal: v })}
        />
      </Row>
      <Row inline label="Start a comparison on its own before a renewal">
        <Toggle
          label="Auto-compare before renewals"
          checked={s.autoCompareBeforeRenewal}
          onChange={(v) => set({ autoCompareBeforeRenewal: v }, v ? "It will still ask before spending" : "Saved")}
        />
      </Row>
      <Row inline label="Blur personal details in screenshots">
        <Toggle label="Blur screenshots" checked={s.redactScreenshots} onChange={(v) => set({ redactScreenshots: v })} />
      </Row>
      <Row label="Sites the agent should never visit" stack>
        <ChipList
          label="Add a site to block"
          placeholder="example.com"
          items={s.blockedSites}
          normalize={(v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
          validate={(v) => (DOMAIN.test(v) ? null : "Enter a site like example.com")}
          onChange={(blockedSites) => set({ blockedSites }, "Blocked sites saved")}
        />
      </Row>
      <LaterRow label="Runs for each tool in a test (3 for now)" />
      <Group label="Always on">
        <FixedRow label="Actions per run" value="20 at most" />
        <FixedRow label="Time per run" value="180 seconds" />
        <FixedRow label="Sites it can visit" value="Each tool's official sites" />
        <FixedRow label="Keys and passwords in the sandbox" value="Never" />
        <FixedRow label="Submitting a form" value="Asks you first" />
        <FixedRow label="CAPTCHAs, logins and two-factor prompts" value="Stops, never bypasses" />
        <FixedRow label="After every run" value="Sandbox destroyed" />
      </Group>
    </Section>
  );
}

/* ── Notifications ────────────────────────────────────────────────────── */

function NotificationsSection({ s, set, say }: P & { say: (t: string) => void }) {
  const providers = [...new Set(homeSample.subscriptions.map((x) => x.toolName))];
  return (
    <Section id="notifications" title="Notifications">
      <Group label="Where">
        <Row inline label="In Wallio">
          <Toggle label="In-app notifications" checked={s.notifyInApp} onChange={(v) => set({ notifyInApp: v })} />
        </Row>
        <LaterRow label="Email (needs an account)" />
      </Group>
      <Group label="What">
        <Row inline label="An approval needs you">
          <Toggle label="Approval alerts" checked={s.notifyApproval} onChange={(v) => set({ notifyApproval: v })} />
        </Row>
        <Row inline label="A comparison finished">
          <Toggle label="Run finished alerts" checked={s.notifyRunFinished} onChange={(v) => set({ notifyRunFinished: v })} />
        </Row>
        <Row label={`A renewal is ${s.renewalLeadDays} days away`}>
          <Toggle label="Renewal alerts" checked={s.notifyRenewal} onChange={(v) => set({ notifyRenewal: v })} />
        </Row>
        <Row label="A price or plan changed on a tool you use">
          <Segmented
            label="Price changes"
            value={s.notifyPriceChanges}
            onChange={(v) => set({ notifyPriceChanges: v })}
            options={[
              { id: "big", label: "Big changes" },
              { id: "all", label: "All" },
              { id: "off", label: "Off" },
            ]}
          />
        </Row>
        <Row label="A new tool fits one of your workflows">
          <Segmented
            label="New matches"
            value={s.notifyNewMatches}
            onChange={(v) => set({ notifyNewMatches: v })}
            options={[
              { id: "digest", label: "In the digest" },
              { id: "now", label: "Right away" },
              { id: "off", label: "Off" },
            ]}
          />
        </Row>
      </Group>
      <Group label="When">
        <Row label="Digest">
          <Segmented
            label="Digest"
            value={s.digest}
            onChange={(v) => set({ digest: v })}
            options={[
              { id: "daily", label: "Daily" },
              { id: "weekly", label: "Weekly" },
              { id: "off", label: "Off" },
            ]}
          />
        </Row>
        {s.digest !== "off" && (
          <Row label={s.digest === "weekly" ? "Send it on" : "Send it at"}>
            {s.digest === "weekly" && (
              <Select label="Digest day" value={s.digestDay} onChange={(v) => set({ digestDay: v })} options={[...DAYS]} />
            )}
            <TimeField label="Digest time" value={s.digestTime} onChange={(v) => set({ digestTime: v })} />
          </Row>
        )}
        <Row label="Quiet hours">
          {s.quietHours && (
            <>
              <TimeField label="Quiet from" value={s.quietFrom} onChange={(v) => set({ quietFrom: v })} />
              <span className="text-[13px] text-text-3">to</span>
              <TimeField label="Quiet until" value={s.quietTo} onChange={(v) => set({ quietTo: v })} />
            </>
          )}
          <Toggle label="Quiet hours" checked={s.quietHours} onChange={(v) => set({ quietHours: v })} />
        </Row>
        <Row label="Never notify me about" stack>
          <div className="flex flex-wrap items-center gap-2">
            <ChipList
              label="Mute a tool"
              placeholder="Tool name"
              items={s.mutedProviders}
              validate={(v) => (providers.some((p) => p.toLowerCase() === v.toLowerCase()) ? null : `Pick one of your tools: ${providers.join(", ")}`)}
              normalize={(v) => providers.find((p) => p.toLowerCase() === v.trim().toLowerCase()) ?? v.trim()}
              onChange={(mutedProviders) => set({ mutedProviders }, "Muted list saved")}
            />
          </div>
        </Row>
      </Group>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={!s.notifyInApp}
          onClick={() =>
            say(
              s.quietHours && inQuiet(s.quietFrom, s.quietTo)
                ? "Quiet hours are on, so this would wait until " + s.quietTo
                : "Test: Cursor renews in 9 days. Compare first?",
            )
          }
        >
          Send a test notification
        </Button>
        {!s.notifyInApp && <span className="text-[12px] text-text-3">Turn on In Wallio first</span>}
      </div>
    </Section>
  );
}

function inQuiet(from: string, to: string) {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const a = fh * 60 + fm;
  const b = th * 60 + tm;
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

/* ── Connections ──────────────────────────────────────────────────────── */

function ConnectionsSection({ s, set }: P) {
  return (
    <Section id="connections" title="Connections">
      <Row
        inline
        label={
          <span className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md bg-surface-3">
              <GithubLogo size={15} />
            </span>
            <span>
              GitHub <span className="text-[12px] text-text-3">· Sample</span>
              <span className="block text-[12px] text-text-3">
                {s.githubConnected ? "Reads languages and editor files in wallio-demo" : "Disconnected. Its guesses were removed."}
              </span>
            </span>
          </span>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            set({ githubConnected: !s.githubConnected }, s.githubConnected ? "GitHub disconnected" : "GitHub reconnected")
          }
        >
          {s.githubConnected ? "Disconnect" : "Reconnect"}
        </Button>
      </Row>
      <Row inline label="Let Wallio guess from connected accounts">
        <Toggle
          label="Allow guesses"
          checked={s.allowGuesses}
          onChange={(v) => set({ allowGuesses: v }, v ? "Guesses back on. Each still needs your OK" : "No more guesses")}
        />
      </Row>
      <LaterRow label="Email receipts, to fill in prices" />
      <LaterRow label="Import billing from a CSV" />
    </Section>
  );
}

/* ── Profile ──────────────────────────────────────────────────────────── */

function ProfileSection({ s, set }: P) {
  return (
    <Section id="profile" title="Profile">
      <Row label="Role, workflows and what Wallio knows about you">
        <EditLink href="/my-ai">Edit on My AI</EditLink>
      </Row>
      <Row label="What matters most when ranking tools">
        <EditLink href="/discover">Adjust on Discover</EditLink>
      </Row>
      <Row label="Prefer tools that run">
        <Segmented
          label="Local or cloud"
          value={s.localPreference}
          onChange={(v) => set({ localPreference: v }, "Saved. Discover will use it next research")}
          options={[
            { id: "any", label: "Anywhere" },
            { id: "local", label: "On my device" },
            { id: "cloud", label: "In the cloud" },
          ]}
        />
      </Row>
      <Row label="Devices you use" stack>
        <MultiPick
          options={["macOS", "Windows", "Linux", "iOS", "Android", "Web"]}
          value={s.platforms}
          onChange={(platforms) => set({ platforms })}
        />
      </Row>
      <LaterRow label="Choose which requirements are hard filters" />
      <LaterRow label="Profile version history" />
    </Section>
  );
}

function EditLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-9 items-center gap-1.5 rounded-md px-1 text-[13px] text-text-2 transition-colors hover:text-text-1"
    >
      {children} <ArrowRight size={13} />
    </Link>
  );
}

/* ── Account ──────────────────────────────────────────────────────────── */

function AccountSection({ s, set }: P) {
  const zones = ZONES.includes(s.timeZone) ? ZONES : [s.timeZone, ...ZONES];
  let now = "";
  try {
    now = new Date().toLocaleTimeString("en-US", { timeZone: s.timeZone, hour: "numeric", minute: "2-digit" });
  } catch {}
  return (
    <Section id="account" title="Account">
      <Row label="Name" htmlFor="name">
        <TextField
          id="name"
          label="Name"
          value={s.displayName}
          validate={(v) => (v.trim().length === 0 ? "Name can't be empty" : v.length > 40 ? "Keep it under 40 characters" : null)}
          onSave={(displayName) => set({ displayName }, "Name saved")}
        />
      </Row>
      <Row label="Time zone">
        <span className="tnum text-[13px] text-text-3" suppressHydrationWarning>
          {now}
        </span>
        <Select
          label="Time zone"
          value={s.timeZone}
          onChange={(timeZone) => set({ timeZone })}
          options={zones.map((z) => ({ id: z, label: z.replace(/_/g, " ").replace("/", " / ") }))}
        />
      </Row>
      <Row label="Currency">
        <Select
          label="Currency"
          value={s.currency}
          onChange={() => {}}
          options={[
            { id: "USD", label: "US dollar (USD)" },
            { id: "EUR" as "USD", label: "Euro (later)", disabled: true },
            { id: "GBP" as "USD", label: "Pound (later)", disabled: true },
          ]}
        />
      </Row>
      <LaterRow label="Email and sign-in (you're using a guest workspace)" />
      <LaterRow label="Signed-in devices" />
      <LaterRow label="Wallio plan and billing" />
    </Section>
  );
}

/* ── Display ──────────────────────────────────────────────────────────── */

function DisplaySection({ s, set }: P) {
  return (
    <Section id="display" title="Display">
      <Row label="Reduce motion">
        <Segmented
          label="Reduce motion"
          value={s.reduceMotion}
          onChange={(v) => set({ reduceMotion: v }, v === "always" ? "Animations off" : "Following your system")}
          options={[
            { id: "system", label: "Follow system" },
            { id: "always", label: "Always" },
          ]}
        />
      </Row>
      <Row label="My AI opens in">
        <Segmented
          label="My AI view"
          value={s.myAiView}
          onChange={(v) => set({ myAiView: v })}
          options={[
            { id: "cards", label: "Cards" },
            { id: "table", label: "Table" },
          ]}
        />
      </Row>
      <FixedRow label="Theme" value="Dark" />
    </Section>
  );
}

/* ── Privacy and data ─────────────────────────────────────────────────── */

function PrivacySection({ s, set, say }: P & { say: (t: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    // TODO(api): POST /api/privacy/export returns a signed download of everything on the server.
    const payload = {
      exportedAt: new Date().toISOString(),
      note: "Sample data. A real export comes from the server once your account is connected.",
      settings: s,
      inventory: homeSample.subscriptions,
      profile: profileSample,
      decisions: decisionsSample.history,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallio-export-${homeSample.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    say("Export downloaded");
  };

  const schedule = () => {
    // TODO(api): DELETE /api/account with a 14-day cancellation window.
    const d = new Date(homeSample.today + "T12:00:00");
    d.setDate(d.getDate() + 14);
    set({ deletionScheduledFor: d.toISOString().slice(0, 10) }, "Deletion scheduled. You have 14 days to cancel");
    setConfirming(false);
    setTyped("");
  };

  return (
    <Section id="privacy" title="Privacy and data">
      <Group label="How long we keep things">
        <Row label="Screenshots and run traces">
          <Segmented
            label="Keep screenshots"
            value={String(s.keepScreenshotsDays)}
            onChange={(v) => set({ keepScreenshotsDays: Number(v) })}
            options={[
              { id: "1", label: "1 day" },
              { id: "7", label: "7 days" },
              { id: "30", label: "30 days" },
            ]}
          />
        </Row>
        <Row label="Comparison reports">
          <Segmented
            label="Keep reports"
            value={String(s.keepReportsDays)}
            onChange={(v) => set({ keepReportsDays: Number(v) })}
            options={[
              { id: "30", label: "30 days" },
              { id: "90", label: "90 days" },
              { id: "365", label: "1 year" },
            ]}
          />
        </Row>
        <FixedRow label="Saved decisions" value="Until you delete them" />
      </Group>
      <Group label="Sharing">
        <Row inline label="Use my data to improve recommendations for others">
          <Toggle label="Share for improvement" checked={s.shareForImprovement} onChange={(v) => set({ shareForImprovement: v })} />
        </Row>
        <Row inline label="Product analytics">
          <Toggle label="Analytics" checked={s.analytics} onChange={(v) => set({ analytics: v })} />
        </Row>
        <Row label="Tools Wallio earns a referral fee from">
          <Segmented
            label="Referral tools"
            value={s.referralTools}
            onChange={(v) => set({ referralTools: v })}
            options={[
              { id: "show", label: "Show, marked" },
              { id: "hide", label: "Hide" },
            ]}
          />
        </Row>
        <FixedRow label="Paid placements in rankings" value="Never" />
      </Group>
      <Group label="Your data">
        <Row label="Export everything">
          <Button variant="secondary" size="sm" onClick={exportAll}>
            <DownloadSimple size={14} /> Download JSON
          </Button>
        </Row>
        <LaterRow label="Delete a single run and its evidence" />
      </Group>

      {/* Danger zone: last, bordered, and behind typed confirmation (destructive-action UX). */}
      <div className="m-4 rounded-[14px] border border-danger/30">
        <div className="flex min-h-14 flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-text-1">Delete my account and everything in it</span>
          {s.deletionScheduledFor ? (
            <span className="text-[13px] text-danger">Scheduled for {formatShortDate(s.deletionScheduledFor)}</span>
          ) : !confirming ? (
            <Button
              variant="secondary"
              size="sm"
              className="text-danger"
              onClick={() => {
                setConfirming(true);
                setTimeout(() => ref.current?.focus(), 50);
              }}
            >
              Delete account
            </Button>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {confirming && !s.deletionScheduledFor && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 border-t border-danger/20 px-5 py-4">
                <label htmlFor="confirm-delete" className="text-[13px] text-text-2">
                  Type <span className="font-mono text-text-1">delete</span> to confirm. You&apos;ll have 14 days to change your mind.
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="confirm-delete"
                    ref={ref}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="h-9 w-48 rounded-md border border-line-strong bg-bg px-3 font-mono text-[14px] text-text-1 outline-none focus:border-danger/60"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-danger"
                    disabled={typed.trim().toLowerCase() !== "delete"}
                    onClick={schedule}
                  >
                    Delete account
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirming(false);
                      setTyped("");
                    }}
                  >
                    Keep my account
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
}

/* ── Demo ─────────────────────────────────────────────────────────────── */

function DemoSection({ s, set, say }: P & { say: (t: string) => void }) {
  const changed = JSON.stringify({ ...s, timeZone: "" }) !== JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "" });
  return (
    <Section id="demo" title="Demo">
      <FixedRow label="Data shown" value="Sample data until the backend is connected" />
      <Row label="Next comparison ends as">
        <Select
          label="Simulated outcome"
          value={s.simulate}
          onChange={(v) => set({ simulate: v }, v === "none" ? "Runs finish normally" : "The next comparison will play this outcome")}
          options={[
            { id: "none", label: "Normal" },
            { id: "partial", label: "Partial" },
            { id: "failed", label: "Failed" },
            { id: "timed_out", label: "Timed out" },
            { id: "reconnecting", label: "Connection drops" },
            { id: "cleanup_failed", label: "Cleanup fails" },
          ]}
        />
      </Row>
      <Row label="Reset every setting to the default">
        <Button
          variant="secondary"
          size="sm"
          disabled={!changed}
          onClick={() => {
            resetSettings();
            say("Settings reset");
          }}
        >
          Reset
        </Button>
      </Row>
    </Section>
  );
}
