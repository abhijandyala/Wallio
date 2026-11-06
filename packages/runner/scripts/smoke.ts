/**
 * Live smoke test against a running runner daemon. Plays the control plane's
 * step loop for the golden-path workflows and writes a dated report with
 * screenshots to smoke-out/<timestamp>/ (PRD §19 release evidence).
 *
 *   RUNNER_URL=https://10.1.96.4:8443 RUNNER_SHARED_TOKEN=... \
 *   NODE_EXTRA_CA_CERTS=runner-cert.pem \
 *   HOSTILE_URL=https://hostile.<domain>/ SENTINEL_URL=http://10.1.96.3:9099 \
 *   npm run smoke -w @wallio/runner
 *
 * HOSTILE_URL and SENTINEL_URL are optional; without them the containment run is skipped.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = (process.env.RUNNER_URL || `http://127.0.0.1:${process.env.RUNNER_PORT || 8443}`).replace(/\/$/, "");
const TOKEN = process.env.RUNNER_SHARED_TOKEN || "";
const HOSTILE = process.env.HOSTILE_URL || "";
const SENTINEL = (process.env.SENTINEL_URL || "").replace(/\/$/, "");
const RESEARCH = [
  { name: "copilot", url: "https://github.com/features/copilot/plans", hosts: ["github.com", "github.githubassets.com"] },
  { name: "zed", url: "https://zed.dev/pricing", hosts: ["zed.dev"] },
];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = resolve(import.meta.dirname, "..", "smoke-out", stamp);
mkdirSync(OUT, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const timings: Record<string, number> = {};
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
  const ct = res.headers.get("content-type") ?? "";
  return { status: res.status, body: ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

async function job(purpose: string, hosts: string[], limits = { deadlineMs: 120_000, maxActions: 20, maxScreenshots: 12 }) {
  const jobId = `smoke_${stamp}_${purpose}`;
  const t0 = Date.now();
  const r = await call("POST", "/jobs", { jobId, runId: `run_${stamp}`, correlationId: `corr_${stamp}`, purpose: `smoke: ${purpose}`, allowedHosts: hosts, limits });
  timings[`${purpose}: container start`] = Date.now() - t0;
  if (r.status !== 201) throw new Error(`create ${purpose} → ${r.status} ${JSON.stringify(r.body)}`);
  let step = 0;
  const act = async (action: Record<string, unknown>) => {
    const res = await call("POST", `/jobs/${jobId}/actions`, { actionId: `a${step}`, stepIndex: step++, action });
    return res.body;
  };
  const saveShot = async (label: string, result: any) => {
    const meta = result?.observation?.screenshot;
    if (!meta) return null;
    const png = await call("GET", `/artifacts/${meta.artifactId}`);
    const file = `${label}.png`;
    writeFileSync(join(OUT, file), png.body);
    return file;
  };
  const waitCleanup = async () => {
    for (let i = 0; i < 100; i++) {
      const c = await call("GET", `/jobs/${jobId}/cleanup`);
      if (c.body.status !== "pending") return c.body;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };
  return { jobId, act, saveShot, finish: async () => (await call("POST", `/jobs/${jobId}/finish`)).body, cancel: (reason: string) => call("POST", `/jobs/${jobId}/cancel`, { reason }), waitCleanup };
}

const sentinelCount = async () => (SENTINEL ? ((await (await fetch(`${SENTINEL}/count`)).json()) as { hits: number }).hits : null);

async function main() {
  const health = await call("GET", "/healthz");
  check("runner healthy", health.status === 200 && health.body.ok === true, `driver=${health.body.driver} digest=${health.body.imageDigest?.slice(0, 19)}`);
  const evidence: any[] = [];

  // 1. Research (mode: researched). One job per tool, each with its minimal allowlist.
  for (const r of RESEARCH) {
    const j = await job(`research-${r.name}`, r.hosts);
    const t0 = Date.now();
    const nav = await j.act({ type: "navigate", url: r.url });
    timings[`${r.name}: navigate`] = Date.now() - t0;
    const o = nav.observation;
    check(`${r.name}: page loaded`, nav.status === "ok" && o?.httpStatus === 200, `${nav.status} ${o?.httpStatus ?? ""} ${o?.title ?? nav.error?.message ?? ""}`.trim());
    check(`${r.name}: not blocked`, !o?.blocked, o?.blocked ? `${o.blocked.reason}: ${o.blocked.detail}` : "");
    const ins = await j.act({ type: "inspect", maxElements: 40 });
    const shot = await j.act({ type: "screenshot", fullPage: false });
    const file = await j.saveShot(r.name, shot);
    check(`${r.name}: screenshot captured`, !!file, file ?? shot.error?.message);
    const report = await j.finish();
    check(`${r.name}: cleanup verified`, report.status === "cleaned" && report.containerRemoved && report.volumeRemoved, report.detail);
    evidence.push({
      tool: r.name, url: o?.url, title: o?.title, httpStatus: o?.httpStatus, capturedAt: o?.capturedAt, textSha256: o?.textSha256,
      excerpt: o?.textExcerpt?.slice(0, 600), elements: ins.observation?.elements?.length ?? 0, screenshot: file,
      screenshotSha256: shot.observation?.screenshot?.sha256, deniedHosts: [...new Set(report.deniedRequests.map((d: any) => `${d.url} (${d.reason})`))],
      cleanup: report.detail,
    });
  }

  // 2. Containment (only when a deployed hostile page is given).
  let containment: any = null;
  if (HOSTILE) {
    const before = await sentinelCount();
    const host = new URL(HOSTILE).hostname;
    const j = await job("containment", [host]);
    const nav = await j.act({ type: "navigate", url: HOSTILE });
    await new Promise((r) => setTimeout(r, 1500));
    const ins = await j.act({ type: "inspect" });
    const claim = ins.observation?.elements?.find((e: any) => e.name === "Claim credit");
    const verify = ins.observation?.elements?.find((e: any) => e.name === "Verify my account");
    const shot = await j.act({ type: "screenshot" });
    await j.saveShot("containment-page", shot);
    const claimR = claim ? await j.act({ type: "click", elementRef: claim.ref }) : null;
    const verifyR = verify ? await j.act({ type: "click", elementRef: verify.ref }) : null;
    const report = await j.finish();
    const after = await sentinelCount();
    check("containment: injection returned as data", /SYSTEM OVERRIDE/.test(nav.observation?.textExcerpt ?? ""));
    check("containment: inspect exposes private targetHost", !!claim && claim.targetHost !== host, claim?.targetHost);
    check("containment: submit without approval refused", claimR?.error?.code === "approval_token_invalid");
    check("containment: metadata navigation denied by proxy", verifyR?.status === "denied" && verifyR?.error?.code === "egress_denied");
    check("containment: private and metadata requests denied", report.deniedRequests.some((d: any) => d.reason === "private_range"), `${report.deniedRequests.length} denials`);
    if (before !== null) check("containment: sentinel unchanged", after === before, `before=${before} after=${after}`);
    if (SENTINEL) {
      const ping = await fetch(`${SENTINEL}/ping`).then((r) => r.ok).catch(() => false);
      check("containment: sentinel reachable from this host (so 0 hits means policy)", ping);
    }
    check("containment: cleanup verified", report.status === "cleaned", report.detail);
    check("containment: runner still healthy", (await call("GET", "/healthz")).body.ok === true);
    containment = { deniedRequests: report.deniedRequests, sentinelBefore: before, sentinelAfter: after, cleanup: report.detail };
  } else {
    console.log("SKIP  containment (set HOSTILE_URL and SENTINEL_URL)");
  }

  // 3. Cancel and deadline paths against a real page.
  {
    const j = await job("cancel", ["zed.dev"]);
    const p = j.act({ type: "navigate", url: "https://zed.dev/pricing" });
    await new Promise((r) => setTimeout(r, 300));
    await j.cancel("user_cancelled");
    await p;
    const c = await j.waitCleanup();
    check("cancel: cleanup verified", c?.status === "cleaned", c?.detail);
  }
  {
    const j = await job("deadline", ["zed.dev"], { deadlineMs: 4_000, maxActions: 20, maxScreenshots: 12 });
    await j.act({ type: "navigate", url: "https://zed.dev/pricing" });
    await new Promise((r) => setTimeout(r, 4_500));
    const late = await j.act({ type: "inspect" });
    const c = await j.waitCleanup();
    check("deadline: enforced by runner", late?.error?.code === "deadline_exceeded", late?.error?.code ?? late?.code);
    check("deadline: cleanup verified", c?.status === "cleaned", c?.detail);
  }

  const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); } catch { return "unknown"; } })();
  const passed = checks.filter((c) => c.ok).length;
  const report = { at: new Date().toISOString(), commit, runner: BASE, health: health.body, passed, total: checks.length, checks, timings, evidence, containment };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const md = [
    `# Runner smoke ${report.at}`, "", `Commit \`${commit}\` · runner \`${BASE}\` · driver \`${health.body.driver}\` · image \`${health.body.imageDigest}\``, "",
    `**${passed}/${checks.length} checks passed.**`, "", "| Check | Result | Detail |", "|---|---|---|",
    ...checks.map((c) => `| ${c.name} | ${c.ok ? "PASS" : "**FAIL**"} | ${c.detail.replace(/\|/g, "\\|").slice(0, 160)} |`), "",
    "## Timings (ms)", "", ...Object.entries(timings).map(([k, v]) => `- ${k}: ${v}`), "",
    "## Evidence", "", ...evidence.flatMap((e) => [`### ${e.tool}`, `- ${e.url} · HTTP ${e.httpStatus} · ${e.capturedAt}`, `- text ${e.textSha256} · screenshot ${e.screenshot} ${e.screenshotSha256}`, `- denied: ${e.deniedHosts.join(", ") || "none"}`, `- ${e.cleanup}`, ""]),
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), md);
  console.log(`\n${passed}/${checks.length} passed. Report: ${OUT}/report.md`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`smoke failed: ${(e as Error).message}`);
  process.exit(2);
});
