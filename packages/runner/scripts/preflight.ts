/**
 * Operator checklist before a rehearsal or the live demo (PRD §25). Run on
 * the runner host:  npm run preflight -w @wallio/runner
 * Optional: SENTINEL_URL=http://<control-private-ip>:9099
 */
import { spawnSync } from "node:child_process";
import { readFileSync, statfsSync } from "node:fs";

const BASE = (process.env.RUNNER_URL || `${process.env.RUNNER_TLS_CERT ? "https" : "http"}://${process.env.RUNNER_BIND_HOST || "127.0.0.1"}:${process.env.RUNNER_PORT || 8443}`).replace(/\/$/, "");
const DOCKER = process.env.DOCKER_BIN || "docker";
const BROWSER = process.env.RUNNER_BROWSER_IMAGE || "wallio-browser:0.1.0";
const CURL = "curlimages/curl:8.17.0@sha256:935d9100e9ba842cdb060de42472c7ca90cfe9a7c96e4dacb55e79e560b3ff40";
const SENTINEL = (process.env.SENTINEL_URL || "").replace(/\/$/, "");
let failed = 0;
const row = (ok: boolean, name: string, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };
const d = (args: string[]) => spawnSync(DOCKER, args, { encoding: "utf8", timeout: 30_000 });

const health = await fetch(`${BASE}/healthz`, { headers: { authorization: `Bearer ${process.env.RUNNER_SHARED_TOKEN}` }, signal: AbortSignal.timeout(5_000) }).then((r) => r.json()).catch((e) => ({ error: (e as Error).message }));
row(health.ok === true, "daemon healthy and not paused", health.error ?? health.paused ?? "");
row(health.activeJobs === 0, "no job running");
const digest = d(["image", "inspect", "--format", "{{.Id}}", BROWSER]).stdout.trim();
row(!!digest && digest === health.imageDigest, "browser image digest matches the daemon", digest.slice(0, 19));
row(d(["ps", "-a", "-q", "--filter", "label=wallio.job"]).stdout.trim() === "", "no leftover job containers");
row(d(["volume", "ls", "-q", "--filter", "label=wallio.job"]).stdout.trim() === "", "no leftover job volumes");
row(d(["ps", "-q", "--filter", "name=wallio-egress", "--filter", "status=running"]).stdout.trim() !== "", "egress proxy running");
row(d(["network", "inspect", "--format", "{{.Internal}}", "wallio-jobs"]).stdout.trim() === "true", "jobs network is internal");
const probe = d(["run", "--rm", "--network", "wallio-jobs", "--dns", "127.0.0.1", "--cap-drop", "ALL", CURL, "-sS", "-m", "4", "https://1.1.1.1/"]);
row(probe.status !== 0, "escape probe: direct internet from jobs network fails");
const meta = d(["run", "--rm", "--network", "wallio-jobs", "--dns", "127.0.0.1", "--cap-drop", "ALL", CURL, "-sS", "-m", "4", "http://169.254.169.254/"]);
row(meta.status !== 0, "escape probe: cloud metadata from jobs network fails");
const fs = statfsSync("/");
const freeGb = (fs.bavail * fs.bsize) / 1e9;
row(freeGb > 3, "disk free > 3 GB", `${freeGb.toFixed(1)} GB`);
// MemAvailable counts reclaimable cache; os.freemem() does not on every platform.
const avail = (() => { try { return Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))![1]) * 1024; } catch { return null; } })();
if (avail === null) console.log("SKIP  memory available (no /proc/meminfo on this OS)");
else row(avail > 1.5e9, "memory available > 1.5 GB", `${(avail / 1e9).toFixed(1)} GB`);
if (SENTINEL) {
  const ping = await fetch(`${SENTINEL}/ping`, { signal: AbortSignal.timeout(3_000) }).then((r) => r.ok).catch(() => false);
  row(ping, "sentinel reachable over the private network (so 0 hits proves the policy)");
  const count = await fetch(`${SENTINEL}/count`).then((r) => r.json()).catch(() => null);
  row(count?.hits === 0, "sentinel count is 0", JSON.stringify(count));
}
console.log(failed ? `\n${failed} check(s) failed. Fix before the demo.` : "\nAll preflight checks passed.");
process.exit(failed ? 1 : 0);
