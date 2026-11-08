"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react";
import { Panel } from "@/components/kit/panel";
import { ChoiceList } from "@/components/kit/choice-list";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { Segmented } from "@/components/kit/segmented";
import { StepList } from "@/components/kit/step-list";
import { Tag } from "@/components/kit/tag";
import { ToolMark } from "@/components/kit/tool-mark";
import { Wordmark } from "@/components/kit/wordmark";
import { GlowCanvas } from "@/components/kit/glow-canvas";
import { Button } from "@/components/ui/button";
import { api, explainFailure, resetGuestSession } from "@/lib/api/client";
import { invalidate, load, resetSession, useApiStatus } from "@/lib/api/cache";
import type { ApiSubscription, CatalogTool, ProfileVersion } from "@/lib/api/contract";
import type { GithubFinding } from "@/lib/github-import";
import {
  BUDGETS,
  EMPTY_ANSWERS,
  FIRST_COMPARISON,
  ROLES,
  WORKFLOWS,
  confirmSample,
  markOnboardingDone,
  clearOnboardingDone,
  onboardingDone,
  parseDollars,
  sampleSubscriptions,
  toProfileInput,
  toSubscription,
  withWorkflow,
  fromExisting,
  githubAttributes,
  type Deploy,
  type Level,
  type OnboardingAnswers,
  type OwnedTool,
  type WorkflowId,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type Path = "own" | "sample";
type Step = "intro" | "connect" | "work" | "tools" | "budget" | "review" | "decision";

const STEPS: Record<Path, { id: Step; label: string }[]> = {
  own: [
    { id: "intro", label: "Welcome" },
    { id: "connect", label: "Connect GitHub (optional)" },
    { id: "work", label: "Your work" },
    { id: "tools", label: "Your tools" },
    { id: "budget", label: "Budget and privacy" },
    { id: "review", label: "Check your profile" },
    { id: "decision", label: "Your first decision" },
  ],
  sample: [
    { id: "intro", label: "Welcome" },
    { id: "review", label: "Check the sample profile" },
    { id: "decision", label: "Your first decision" },
  ],
};

const DEPLOY: { id: Deploy; label: string }[] = [
  { id: "local", label: "On my device" },
  { id: "cloud", label: "In the cloud" },
  { id: "either", label: "Either" },
];
const LEVELS: { id: Level; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];
const CADENCE: { id: OwnedTool["cadence"]; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Yearly" },
  { id: "free", label: "Free" },
];
const label = <T extends string>(list: { id: T; label: string }[], id: T | null) => list.find((x) => x.id === id)?.label ?? "Not set";
const dollars = (minor: number) => "$" + (minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

const input =
  "h-10 w-full rounded-[8px] border border-line-strong bg-bg px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3 transition-colors focus:border-aurora/60";

/**
 * First run (PRD F02, Flow A): main tasks, current tools, spending range, privacy, an editable
 * summary, then one first decision. Nothing to connect. Saves through the same API endpoints
 * My AI uses: POST /api/inventory (and PATCH to set sample tools aside) and POST /api/profile/versions.
 */
export function Onboarding() {
  const router = useRouter();
  const status = useApiStatus();
  const offline = status.state === "offline";

  const [path, setPath] = useState<Path>("own");
  const [step, setStep] = useState<Step>("intro");
  const [a, setA] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [customRole, setCustomRole] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [budgetChoice, setBudgetChoice] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogTool[] | null>(null);
  const [sample, setSample] = useState<{ profile: ProfileVersion; subs: ApiSubscription[]; tools: Map<string, CatalogTool> } | null>(null);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [profile, setProfile] = useState<ProfileVersion | null>(null);
  /** toolId → subscription id this onboarding created, so going back and saving again updates instead of duplicating. */
  const [created, setCreated] = useState<Record<string, string>>({});

  const [repoInput, setRepoInput] = useState("");
  const [finding, setFinding] = useState<GithubFinding | null>(null);
  /** Inferred GitHub facts the person removed on the review step. */
  const [githubKeep, setGithubKeep] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A browser that finished setup goes straight to Home; /start?again=1 (Settings) starts over.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("again")) clearOnboardingDone();
    else if (onboardingDone()) router.replace("/home");
  }, [router]);

  // Catalog and the guest workspace's data. The API seeds every new guest with a sample developer
  // (profile version 1). A workspace that was set up before is loaded into the answers instead.
  const [workspace, setWorkspace] = useState(0);
  useEffect(() => {
    if (status.state !== "online") return;
    let alive = true;
    Promise.all([load("catalog"), load("profile", { force: true }), load("inventory", { force: true })]).then(
      ([cat, prof, inv]) => {
        if (!alive) return;
        setCatalog(cat);
        setSample({ profile: prof, subs: inv.subscriptions, tools: new Map([...cat, ...inv.tools].map((t) => [t.id, t])) });
        if (prof.version > 1) {
          const prev = fromExisting(prof, inv.subscriptions);
          setA(prev.answers);
          setCustomRole(prev.customRole);
          setBudgetChoice(prev.budgetChoice);
          setCustomBudget(prev.customBudget);
          setCreated(prev.created);
          const repo = prof.attributes.find((x) => x.key === "github_repo");
          if (repo) setRepoInput(String(repo.value));
        }
      },
      (e) => alive && setError(explainFailure(e)),
    );
    return () => {
      alive = false;
    };
  }, [status.state, workspace]);

  /** This workspace was already changed, so the sample developer needs a fresh guest workspace. */
  const edited = !!sample && sample.profile.version > 1;

  const steps = STEPS[path];
  const at = steps.findIndex((s) => s.id === step);
  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const next = async () => {
    if (step === "intro" && path === "sample" && edited) {
      setBusy(true);
      try {
        await resetGuestSession();
        resetSession();
        setSample(null);
        setA(EMPTY_ANSWERS);
        setCreated({});
        setWorkspace((n) => n + 1);
      } catch (e) {
        setError(explainFailure(e));
        return;
      } finally {
        setBusy(false);
      }
    }
    go(steps[Math.min(at + 1, steps.length - 1)]!.id);
  };
  const back = () => go(steps[Math.max(at - 1, 0)]!.id);

  const role = a.role === "custom" ? customRole.trim() : a.role;
  const priceError = a.tools.some((t) => t.cadence !== "free" && Number.isNaN(parseDollars(t.price)));
  const budgetMinor = budgetChoice === "custom" ? parseDollars(customBudget) : (BUDGETS.find((b) => b.id === budgetChoice)?.minor ?? null);
  const answers: OnboardingAnswers = { ...a, role, budgetMinor: budgetMinor !== null && !Number.isNaN(budgetMinor) ? budgetMinor : null };

  const ready: Record<Step, boolean> = {
    intro: status.state === "online" && !!sample,
    connect: !busy,
    work: !!role && a.workflows.length > 0,
    tools: !priceError,
    budget: answers.budgetMinor !== null && !!a.deploy && !!a.sensitivity && !!a.switching,
    review: true,
    decision: true,
  };

  /** Saves the answers through the API, then moves on to the first decision. */
  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (path === "sample") {
        setProfile(await api.saveProfile(confirmSample(sample!.profile, keep)));
      } else {
        // The person's own tools replace the sample developer's: set those aside (archived, not deleted).
        const inv = await api.inventory();
        for (const s of sampleSubscriptions(inv.subscriptions)) await api.updateSubscription(s.id, { status: "archived" });
        const made = { ...created };
        for (const t of a.tools) {
          const body = toSubscription(t);
          if (made[t.toolId]) await api.updateSubscription(made[t.toolId]!, { ...body, status: "active" });
          else made[t.toolId] = (await api.addSubscription(body)).id;
        }
        for (const [toolId, id] of Object.entries(made)) {
          if (!a.tools.some((t) => t.toolId === toolId)) {
            await api.updateSubscription(id, { status: "archived" });
            delete made[toolId];
          }
        }
        setCreated(made);
        setProfile(await api.saveProfile(toProfileInput(answers, finding, githubKeep)));
      }
      // Home and My AI read a shared copy of the API's data; this setup changed it.
      invalidate("profile", "inventory");
      markOnboardingDone(path);
      go("decision");
    } catch (e) {
      setError(explainFailure(e));
    } finally {
      setBusy(false);
    }
  }

  /** Reads a public repository through the GitHub connector (GET /connect/github). Nothing is saved yet. */
  async function readRepo() {
    setBusy(true);
    setError(null);
    setFinding(null);
    try {
      const res = await fetch(`/connect/github?repo=${encodeURIComponent(repoInput.trim())}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "Couldn't read that repository.");
      setFinding(body as GithubFinding);
      setGithubKeep({});
    } catch (e) {
      setError(e instanceof TypeError ? "Can't reach GitHub right now. Try again, or skip this step." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Puts what the repository suggests into the next steps, where the person can still change all of it. */
  function applyFinding() {
    if (!finding) return next();
    const known = new Set(catalog?.map((t) => t.id) ?? []);
    setA((p) => ({
      ...p,
      workflows: p.workflows.length ? p.workflows : (finding.workflows.map((w) => w.id).filter((id): id is WorkflowId => WORKFLOWS.some((x) => x.id === id)) as WorkflowId[]),
      tools: [
        ...p.tools,
        ...finding.tools
          .filter((t) => t.toolId && known.has(t.toolId) && !p.tools.some((x) => x.toolId === t.toolId))
          .map((t) => ({ toolId: t.toolId!, plan: "", price: "", cadence: "monthly" as const })),
      ],
    }));
    void next();
  }

  /** The first comparison runs on debugging; add it to the profile when there's room. */
  async function addDebugging() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      setProfile(await api.saveProfile(withWorkflow(profile, FIRST_COMPARISON.workflowId)));
      invalidate("profile");
    } catch (e) {
      setError(explainFailure(e));
    } finally {
      setBusy(false);
    }
  }

  const toolName = (id: string) => catalog?.find((t) => t.id === id)?.name ?? sample?.tools.get(id)?.name ?? id;

  // ───────────── steps ─────────────

  let body: React.ReactNode;
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  if (step === "intro") {
    body = (
      <>
        <Panel title="Welcome to Wallio">
          <p className="max-w-[640px] text-[15px] leading-[22px] text-text-2">
            Wallio keeps your AI tools, what they cost, what you care about, and the evidence behind each decision in one place. It isn&apos;t a crypto wallet: it never holds money, card details or passwords.
          </p>
        </Panel>
        <Panel title="How do you want to start?" flush>
          <ChoiceList<Path>
            name="path"
            type="radio"
            legend="How to start"
            value={[path]}
            onChange={([p]) => setPath(p!)}
            options={[
              { id: "own", label: edited ? "Change my answers" : "Set up with my own tools", meta: "About 3 minutes" },
              { id: "sample", label: "Explore with a sample developer", meta: edited ? "Starts a fresh guest workspace" : "About 1 minute" },
            ]}
          />
        </Panel>
        <Panel flush>
          <KeyValue>
            <KeyValueRow label="Accounts to connect">None</KeyValueRow>
            <KeyValueRow label="Where your answers go">This browser&apos;s private guest workspace</KeyValueRow>
            <KeyValueRow label="Change them later">Any time, in My AI</KeyValueRow>
          </KeyValue>
        </Panel>
      </>
    );
    primary =
      error && !sample && status.state === "online"
        ? // The first load failed (a rate limit, say): try again instead of leaving Continue dead.
          { label: "Try again", onClick: () => { setError(null); setWorkspace((n) => n + 1); } }
        : { label: busy ? "Starting over…" : "Continue", onClick: next, disabled: !ready.intro || busy };
  } else if (step === "connect") {
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    body = (
      <>
        <Panel title="Start from a public GitHub repository">
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (repoInput.trim()) void readRepo();
            }}
          >
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value.slice(0, 200))}
              placeholder="owner/name or a github.com link"
              aria-label="Public GitHub repository"
              className={cn(input, "max-w-md flex-1")}
            />
            <Button type="submit" variant="secondary" disabled={busy || !repoInput.trim()}>
              {busy ? "Reading…" : "Read repository"}
            </Button>
          </form>
        </Panel>
        {finding ? (
          <Panel title={`Found in ${finding.repo.fullName}`} titleAddon={<Tag kind="inferred" />} flush>
            <KeyValue>
              <KeyValueRow label="Languages">
                <span className="truncate">{finding.languages.slice(0, 3).map((l) => `${l.name} ${pct(l.share)}`).join(", ") || "None found"}</span>
              </KeyValueRow>
              <KeyValueRow label="Frameworks">
                <span className="truncate">{finding.frameworks.join(", ") || "None found in package.json"}</span>
              </KeyValueRow>
              {finding.tools.length ? (
                finding.tools.map((t) => (
                  <KeyValueRow key={t.name} label={t.name}>
                    <span className="truncate font-mono text-[13px] text-text-2">{t.evidence}</span>
                    {!t.toolId && <span className="text-[13px] text-text-3">Not in the catalog</span>}
                  </KeyValueRow>
                ))
              ) : (
                <KeyValueRow label="AI tools set up in the repo">None found</KeyValueRow>
              )}
              <KeyValueRow label="Suggested main tasks">
                <span className="truncate">{finding.workflows.map((w) => WORKFLOWS.find((x) => x.id === w.id)?.name).filter(Boolean).join(", ") || "None"}</span>
              </KeyValueRow>
              <KeyValueRow label="Files looked at">
                <span className="tnum">{finding.filesScanned.toLocaleString("en-US")} names{finding.truncated ? " (GitHub cut the list short)" : ""}</span>
              </KeyValueRow>
            </KeyValue>
          </Panel>
        ) : (
          <Panel flush>
            <KeyValue>
              <KeyValueRow label="What Wallio reads">Languages, file names and package.json</KeyValueRow>
              <KeyValueRow label="What it never reads">Your code, issues or private repositories</KeyValueRow>
              <KeyValueRow label="What gets saved">Only what you keep on the review step</KeyValueRow>
            </KeyValue>
          </Panel>
        )}
      </>
    );
    primary = finding ? { label: "Use these", onClick: applyFinding, disabled: busy } : { label: "Skip", onClick: next, disabled: busy };
  } else if (step === "work") {
    body = (
      <>
        <Panel title="What best describes you?" flush>
          <ChoiceList<string>
            name="role"
            type="radio"
            legend="Your role"
            value={a.role ? [a.role] : []}
            onChange={([r]) => setA((p) => ({ ...p, role: r! }))}
            options={[...ROLES.map((r) => ({ id: r, label: r })), { id: "custom", label: "Something else" }]}
          />
          {a.role === "custom" && (
            <div className="border-t border-line px-6 py-3">
              <input autoFocus value={customRole} onChange={(e) => setCustomRole(e.target.value.slice(0, 80))} placeholder="Your role, in a few words" aria-label="Your role" className={input} />
            </div>
          )}
        </Panel>
        <Panel title="Your main tasks" titleAddon={<span className="text-[13px] font-normal text-text-3">up to 3, most important first</span>} flush>
          <ChoiceList<WorkflowId>
            name="workflows"
            type="checkbox"
            legend="Your main tasks"
            max={3}
            value={a.workflows}
            onChange={(w) => setA((p) => ({ ...p, workflows: w }))}
            options={WORKFLOWS.map((w) => ({
              id: w.id,
              label: a.workflows.includes(w.id) ? `${a.workflows.indexOf(w.id) + 1}. ${w.name}` : w.name,
              meta: w.tested ? "Wallio can test this today" : undefined,
            }))}
          />
        </Panel>
      </>
    );
    primary = { label: "Continue", onClick: next, disabled: !ready.work };
  } else if (step === "tools") {
    const chosen = new Set(a.tools.map((t) => t.toolId));
    const setTool = (id: string, patch: Partial<OwnedTool>) => setA((p) => ({ ...p, tools: p.tools.map((t) => (t.toolId === id ? { ...t, ...patch } : t)) }));
    body = (
      <>
        {a.tools.length > 0 && (
          <Panel title="What you pay" flush>
            <ul>
              {a.tools.map((t) => {
                const bad = t.cadence !== "free" && Number.isNaN(parseDollars(t.price));
                return (
                  <li key={t.toolId} className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-3 first:border-t-0">
                    <ToolMark name={toolName(t.toolId)} />
                    <span className="w-36 shrink-0 truncate text-text-1">{toolName(t.toolId)}</span>
                    <input value={t.plan} onChange={(e) => setTool(t.toolId, { plan: e.target.value.slice(0, 60) })} placeholder="Plan, e.g. Pro" aria-label={`${toolName(t.toolId)} plan`} className={cn(input, "w-36 flex-1")} />
                    <div className="relative w-32">
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3">$</span>
                      <input
                        inputMode="decimal"
                        value={t.cadence === "free" ? "0" : t.price}
                        disabled={t.cadence === "free"}
                        onChange={(e) => setTool(t.toolId, { price: e.target.value.replace(/[^0-9.]/g, "").slice(0, 9) })}
                        placeholder="Unknown"
                        aria-label={`${toolName(t.toolId)} price`}
                        aria-invalid={bad}
                        className={cn(input, "tnum pl-6", bad && "border-danger")}
                      />
                    </div>
                    <Segmented label={`${toolName(t.toolId)} billing`} options={CADENCE} value={t.cadence} onChange={(c) => setTool(t.toolId, { cadence: c })} />
                    <button type="button" aria-label={`Remove ${toolName(t.toolId)}`} onClick={() => setA((p) => ({ ...p, tools: p.tools.filter((x) => x.toolId !== t.toolId) }))} className="text-text-3 transition-colors hover:text-text-1">
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {priceError && (
              <p role="alert" className="border-t border-line px-6 py-3 text-[13px] text-text-2">
                Enter a price like 10 or 10.50, or leave it blank if you don&apos;t know it.
              </p>
            )}
          </Panel>
        )}
        <Panel title="Which AI coding tools do you use?" titleAddon={<span className="text-[13px] font-normal text-text-3">leave a price blank if you don&apos;t know it</span>} flush>
          {catalog ? (
            <ChoiceList<string>
              name="tools"
              type="checkbox"
              legend="Tools you use"
              value={[...chosen]}
              onChange={(ids) =>
                setA((p) => ({
                  ...p,
                  tools: ids.map((id) => p.tools.find((t) => t.toolId === id) ?? { toolId: id, plan: "", price: "", cadence: "monthly" }),
                }))
              }
              options={catalog.map((t) => ({ id: t.id, label: t.name, meta: t.provider, icon: <ToolMark name={t.name} /> }))}
            />
          ) : (
            <p className="px-6 pb-6 text-text-3">Loading the catalog…</p>
          )}
        </Panel>
      </>
    );
    primary = { label: a.tools.length ? "Continue" : "I don't use any yet", onClick: next, disabled: !ready.tools };
  } else if (step === "budget") {
    body = (
      <>
        <Panel title="Most you'd spend on AI tools each month" flush>
          <ChoiceList<string>
            name="budget"
            type="radio"
            legend="Monthly budget"
            value={budgetChoice ? [budgetChoice] : []}
            onChange={([b]) => setBudgetChoice(b!)}
            options={BUDGETS.map((b) => ({ id: b.id, label: b.label }))}
          />
          {budgetChoice === "custom" && (
            <div className="relative border-t border-line px-6 py-3">
              <span className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-text-3">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={customBudget}
                onChange={(e) => setCustomBudget(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))}
                placeholder="Amount per month"
                aria-label="Monthly budget in dollars"
                className={cn(input, "tnum max-w-56 pl-6")}
              />
            </div>
          )}
        </Panel>
        <Panel title="Privacy and switching" flush>
          <KeyValue>
            <KeyValueRow label="Where tools may run your code">
              <Segmented label="Where tools may run" options={DEPLOY} value={a.deploy ?? ("" as Deploy)} onChange={(d) => setA((p) => ({ ...p, deploy: d }))} />
            </KeyValueRow>
            <KeyValueRow label="How sensitive your code is">
              <Segmented label="Data sensitivity" options={LEVELS} value={a.sensitivity ?? ("" as Level)} onChange={(s) => setA((p) => ({ ...p, sensitivity: s }))} />
            </KeyValueRow>
            <KeyValueRow label="How open you are to switching">
              <Segmented label="Open to switching" options={LEVELS} value={a.switching ?? ("" as Level)} onChange={(s) => setA((p) => ({ ...p, switching: s }))} />
            </KeyValueRow>
          </KeyValue>
        </Panel>
      </>
    );
    primary = { label: "Continue", onClick: next, disabled: !ready.budget };
  } else if (step === "review" && path === "own") {
    const edit = (s: Step) => (
      <button type="button" onClick={() => go(s)} className="text-[13px] text-text-3 transition-colors hover:text-text-1">
        Edit
      </button>
    );
    body = (
      <Panel title="Your profile" titleAddon={<Tag kind="user_input" />} flush>
        <KeyValue>
          <KeyValueRow label="Role">
            <span className="truncate">{role}</span>
            {edit("work")}
          </KeyValueRow>
          <KeyValueRow label="Main tasks">
            <span className="truncate">{answers.workflows.map((id) => WORKFLOWS.find((w) => w.id === id)!.name).join(", ")}</span>
            {edit("work")}
          </KeyValueRow>
          <KeyValueRow label="Tools">
            <span className="truncate">{a.tools.length ? a.tools.map((t) => toolName(t.toolId)).join(", ") : "None yet"}</span>
            {edit("tools")}
          </KeyValueRow>
          <KeyValueRow label="Monthly budget">
            <span className="tnum">{answers.budgetMinor === 0 ? "Nothing yet" : dollars(answers.budgetMinor ?? 0)}</span>
            {edit("budget")}
          </KeyValueRow>
          <KeyValueRow label="Where tools may run">
            {label(DEPLOY, a.deploy)}
            {edit("budget")}
          </KeyValueRow>
          <KeyValueRow label="Code sensitivity">
            {label(LEVELS, a.sensitivity)}
            {edit("budget")}
          </KeyValueRow>
          <KeyValueRow label="Open to switching">
            {label(LEVELS, a.switching)}
            {edit("budget")}
          </KeyValueRow>
        </KeyValue>
        {sample && sampleSubscriptions(sample.subs).length > 0 && (
          <p className="border-t border-line px-6 py-3 text-[13px] text-text-3">Saving sets the sample developer&apos;s tools aside, so My AI shows only yours.</p>
        )}
      </Panel>
    );
    if (finding) {
      const facts = githubAttributes(finding).filter((x) => x.origin === "inferred");
      body = (
        <>
          {body}
          <Panel title={`From ${finding.repo.fullName}`} titleAddon={<Tag kind="inferred" />} flush>
            <KeyValue>
              {facts.map((x) => (
                <KeyValueRow key={x.key} label={`${Array.isArray(x.value) ? x.value.join(", ") : String(x.value)} (${x.confidence} confidence)`}>
                  <Segmented
                    label={`Keep ${x.key}`}
                    options={[
                      { id: "keep", label: "Keep" },
                      { id: "remove", label: "Remove" },
                    ]}
                    value={githubKeep[x.key] === false ? "remove" : "keep"}
                    onChange={(v) => setGithubKeep((k) => ({ ...k, [x.key]: v === "keep" }))}
                  />
                </KeyValueRow>
              ))}
            </KeyValue>
          </Panel>
        </>
      );
    }
    primary = { label: busy ? "Saving…" : "Save my profile", onClick: save, disabled: busy };
  } else if (step === "review" && sample) {
    const p = sample.profile;
    const inferred = p.attributes.filter((x) => x.origin === "inferred");
    body = (
      <>
        <Panel title="The sample developer" titleAddon={<Tag kind="sample" />} flush>
          <KeyValue>
            <KeyValueRow label="Role">{p.primaryRole}</KeyValueRow>
            <KeyValueRow label="Main tasks">
              <span className="truncate">{[...p.workflows].sort((x, y) => x.priority - y.priority).map((w) => w.name).join(", ")}</span>
            </KeyValueRow>
            <KeyValueRow label="Tools">
              <span className="truncate">{sampleSubscriptions(sample.subs).map((s) => `${toolName(s.toolId)} ${s.plan}`).join(", ") || "None"}</span>
            </KeyValueRow>
            <KeyValueRow label="Monthly budget">
              <span className="tnum">{dollars(p.budget.maxMonthlyMinor)}</span>
            </KeyValueRow>
            <KeyValueRow label="Where tools may run">{label(DEPLOY, p.deploymentPreference)}</KeyValueRow>
            <KeyValueRow label="Code sensitivity">{label(LEVELS, p.dataSensitivity)}</KeyValueRow>
            <KeyValueRow label="Open to switching">{label(LEVELS, p.willingnessToSwitch)}</KeyValueRow>
          </KeyValue>
        </Panel>
        {inferred.length > 0 && (
          <Panel title="Wallio guessed these" titleAddon={<Tag kind="inferred" />} flush>
            <KeyValue>
              {inferred.map((x) => (
                <KeyValueRow key={x.key} label={`${String(x.value)}, from the ${x.source ?? "sample"} (${x.confidence ?? "low"} confidence)`}>
                  <Segmented
                    label={`Keep ${String(x.value)}`}
                    options={[
                      { id: "keep", label: "Keep" },
                      { id: "remove", label: "Remove" },
                    ]}
                    value={keep[x.key] === false ? "remove" : "keep"}
                    onChange={(v) => setKeep({ ...keep, [x.key]: v === "keep" })}
                  />
                </KeyValueRow>
              ))}
            </KeyValue>
          </Panel>
        )}
      </>
    );
    primary = { label: busy ? "Saving…" : "Use this profile", onClick: save, disabled: busy };
  } else if (step === "decision") {
    const hasDebugging = !!profile?.workflows.some((w) => w.id === FIRST_COMPARISON.workflowId);
    const owns = a.tools.some((t) => t.toolId === FIRST_COMPARISON.incumbent);
    body = hasDebugging ? (
      <>
        <Panel title={`Keep ${toolName(FIRST_COMPARISON.incumbent)} or switch to ${toolName(FIRST_COMPARISON.candidate)} for debugging?`} flush>
          <KeyValue>
            <KeyValueRow label="Task">
              {FIRST_COMPARISON.taskTitle}
              <Tag kind="sample" />
            </KeyValueRow>
            <KeyValueRow label="Your tool">
              {toolName(FIRST_COMPARISON.incumbent)}
              <Tag kind={path === "own" && owns ? "user_input" : "sample"} />
            </KeyValueRow>
            <KeyValueRow label="Candidate">{toolName(FIRST_COMPARISON.candidate)}</KeyValueRow>
            <KeyValueRow label="What Wallio does">Reads both vendors&apos; pages and runs the task on its own test page</KeyValueRow>
            <KeyValueRow label="Profile used">Version {profile?.version}</KeyValueRow>
          </KeyValue>
        </Panel>
        <p className="px-1 text-[13px] text-text-3">This is the one comparison Wallio can run end to end today. You press Run the comparison on the next screen.</p>
      </>
    ) : (
      <Panel title="Your first decision">
        <p className="text-text-2">
          Wallio&apos;s first full test is on debugging, and it isn&apos;t one of your main tasks.{" "}
          {(profile?.workflows.length ?? 0) < 3 ? "Add it to run the comparison, or go to Home." : "You can still see your stack on Home."}
        </p>
      </Panel>
    );
    primary = hasDebugging
      ? { label: "Open the comparison", onClick: () => router.push("/compare?live=1") }
      : (profile?.workflows.length ?? 0) < 3
        ? { label: busy ? "Adding…" : "Add debugging", onClick: addDebugging, disabled: busy }
        : { label: "Go to Home", onClick: () => router.push("/home") };
  } else {
    body = (
      <Panel>
        <p className="text-text-3">Loading the sample developer…</p>
      </Panel>
    );
  }

  // ───────────── frame ─────────────

  const progress = useMemo(
    () => steps.map((s, i) => ({ id: s.id, label: s.label, status: (i < at ? "done" : i === at ? "active" : "pending") as "done" | "active" | "pending", atSeconds: null })),
    [steps, at],
  );

  return (
    <div className="min-h-screen">
      <GlowCanvas strength={0.5} className="z-0" />
      <div className="relative z-[1] mx-auto flex max-w-[1600px] flex-col px-4 pb-16 sm:px-6">
        <header className="flex h-16 items-center justify-between gap-6">
          <Link href="/" aria-label="Wallio home">
            <Wordmark className="[&_span]:text-[17px] [&_svg]:h-[15px]" />
          </Link>
          <Link
            href="/home"
            onClick={() => step === "intro" && markOnboardingDone("sample")}
            className="text-[14px] text-text-2 transition-colors hover:text-text-1"
          >
            Skip to the app
          </Link>
        </header>

        <main id="main" className="grid grid-cols-12 gap-gutter pt-2">
          {/* Progress sits left on wide screens; on phones the step itself comes first. */}
          <div className="order-last col-span-12 flex flex-col gap-gutter lg:order-none lg:col-span-4">
            <Panel title="Setting up Wallio" flush>
              <StepList activeLabel="Now" steps={progress} />
            </Panel>
          </div>

          <div className="col-span-12 flex flex-col gap-gutter lg:col-span-8">
            {offline && (
              <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-1 px-5 py-3">
                <span className="text-text-1">Can&apos;t reach the Wallio API right now, so setup can&apos;t save.</span>
                <span className="text-text-3">You can still look around with sample data.</span>
              </div>
            )}
            {body}
            {error && (
              <p role="alert" className="rounded-[12px] border border-danger/40 bg-surface-1 px-5 py-3 text-text-1">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                {at > 0 && step !== "decision" && (
                  <Button variant="ghost" onClick={back} disabled={busy}>
                    <ArrowLeft size={16} /> Back
                  </Button>
                )}
                {step === "decision" && primary?.label !== "Go to Home" && (
                  <Button variant="ghost" onClick={() => router.push("/home")}>
                    Go to Home
                  </Button>
                )}
                {offline && (
                  <Button variant="ghost" onClick={() => router.push("/home")}>
                    Look around with sample data
                  </Button>
                )}
              </div>
              {primary && (
                <Button variant="primary" size="lg" onClick={primary.onClick} disabled={primary.disabled}>
                  {primary.label}
                  {!busy && <ArrowRight size={16} />}
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
