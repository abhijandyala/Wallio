# @wallio/runner: browser execution and containment

Owner: Adhvik. Implements the API ↔ Runner contract (`docs/CONTRACTS.md` §B, `packages/contracts/src/runner.ts`).

The runner is a daemon on its own Vultr VM. The control plane calls it one action at a time. Each job runs Chromium in a short-lived, locked-down container whose **only** way out is an egress proxy we control. The runner returns observations and screenshots, enforces its own limits and policy whatever the caller or the page says, and **verifies** that every container and volume is gone afterwards.

It never calls inference and holds no Vultr API key, inference key or cookies (PRD §13–14).

```
Control VM (Anish)                       Runner VM
┌──────────────────┐ HTTPS+Bearer, VPC   ┌─────────────────────────────────────────────────────────────┐
│ API/orchestrator │ ──────────────────▶ │ wallio-runner daemon (systemd, non-root, docker group)      │
│ policy/approvals │ ◀── observations ── │  limits · idempotency · approval check · deadline · cleanup │
│ sentinel :9099   │                     │        │ docker CLI (socket never enters a container)       │
└──────────────────┘                     │        ▼                                                    │
        ▲                                │  network wallio-jobs (--internal: no route anywhere)        │
        │ must stay at 0                 │  ┌─────────────────────┐        ┌─────────────────────────┐ │
        └────────── denied ◀─────────────┼──│ job container       │ CONNECT│ wallio-egress proxy     │─┼─▶ allowlisted
                                         │  │ Chromium + agent    │ ─────▶ │ :443 only, exact hosts, │ │   HTTPS hosts
                                         │  │ stdio to daemon     │        │ public IPs only         │ │
                                         │  └─────────────────────┘        └─────────────────────────┘ │
                                         │  host firewall: jobs → proxy only; proxy ↛ metadata/VPC     │
                                         └─────────────────────────────────────────────────────────────┘
```

## Layers of defence

| Layer | What it stops | Where |
|---|---|---|
| Runner policy | Navigate to a host off the job's list; submit without a valid, single-use approval token; filling password/payment/OTP/file fields; going over action, screenshot or time budgets | `src/jobs/service.ts` |
| Agent re-check | Same submit and credential-field checks, done live on the element at click/fill time; approval refused if the page (incl. field values) changed | `agent/main.ts` |
| Egress proxy | Anything but `CONNECT host:443` to an exact allowlisted name; IP literals; names resolving to private/loopback/link-local/metadata (incl. IPv6, mapped, NAT64); plain HTTP; per-job byte cap. Connects to the checked IP (no DNS rebinding) | `src/egress/proxy.ts`, `ip-policy.ts` |
| Docker network | Job containers sit on an `--internal` network with no gateway; DNS points at a dead resolver | `src/sandbox/docker.ts` |
| Host firewall (VM) | Job subnet may only talk to the proxy; proxy subnet can't reach metadata, link-local, 10/8, 192.168/16, 100.64/10; neither can open connections to host services | `deploy/runner/firewall.sh` |
| Container | Non-root `pwuser`, read-only root, `--cap-drop ALL` (+`SYS_CHROOT` only so Chromium's own sandbox can start; `CapEff` is 0), `no-new-privileges`, Playwright's seccomp profile, 1.5 GB memory, 1 CPU, 192 processes, tmpfs volume 256 MB | `src/sandbox/docker.ts` |
| Deadline | Hard timer in the daemon (outside the container) kills the job; agent and daemon watchdogs on every action | `src/jobs/service.ts` |
| Cleanup | Every exit path removes container + volume by name **and** label, then checks they are absent. Failure pauses the runner (`/healthz ok:false`, new jobs refused) until the sweeper verifies they're gone | `src/jobs/service.ts`, `sandbox/docker.ts` |

## Quick start (local, macOS or Linux with Docker)

```bash
npm install
npm run images -w @wallio/runner          # builds wallio-browser + wallio-egress from pinned digests
```

Create `.env.runner` at the repo root (git-ignored):

```
RUNNER_DRIVER=docker
RUNNER_SHARED_TOKEN=<32+ random chars>
RUNNER_APPROVAL_KEY=<32+ random chars, different>
RUNNER_PORT=8443
```

```bash
npm run dev -w @wallio/runner             # http://127.0.0.1:8443
RUNNER_URL=http://127.0.0.1:8443 RUNNER_SHARED_TOKEN=... npm run smoke -w @wallio/runner
```

The smoke run visits the real Copilot and Zed pricing pages and writes `packages/runner/smoke-out/<time>/report.md` plus screenshots. That folder is git-ignored so third-party screenshots stay out of the repo.

**No Docker yet?** `RUNNER_DRIVER=fake` runs the full daemon (auth, limits, idempotency, approvals, denials, cleanup reports) with canned pages that say they are sample data. It is refused when `NODE_ENV=production`.

## Tests

```bash
npm test -w @wallio/runner                # 37 unit tests, no Docker (policy, tokens, proxy, daemon via fake driver)
npm run test:docker -w @wallio/runner     # 13 integration tests: real Chromium, proxy, escape probe, containment
npm run preflight -w @wallio/runner       # operator checklist before a rehearsal or the demo
```

`RUNNER_SAMPLES_DIR=$PWD/samples npm run test:docker -w @wallio/runner` regenerates `samples/`: real results from our own fixture pages, for the UI.

## Integration notes for the control plane (Anish)

**Environment on the control VM.** `deploy/runner/push-runner-secrets.sh` writes these:

| Variable | Use |
|---|---|
| `RUNNER_URL` | `https://<runner-private-ip>:8443` |
| `RUNNER_SHARED_TOKEN` | `Authorization: Bearer …` on every call |
| `RUNNER_APPROVAL_KEY` | Signs approval tokens (below) |
| `RUNNER_CA_FILE` | The runner's self-signed cert; pass it as the TLS `ca` (or `NODE_EXTRA_CA_CERTS`) |

**One job per purpose, minimal allowlist.** These were measured on 5 Nov 2026 and are what render correctly:

| Job | `allowedHosts` | Notes |
|---|---|---|
| Research Copilot | `github.com`, `github.githubassets.com` | Without the assets host the page renders unstyled. Telemetry and ad hosts (`collector.github.com`, `api.github.com`, facebook, reddit, doubleclick) are denied and that's fine; it also keeps the cookie banner away |
| Research Zed | `zed.dev` | Tag manager and consent hosts are denied; page renders fully |
| Eval test | `eval.<domain>` | |
| Trial form | `forms.<domain>` | |
| Containment | `hostile.<domain>` | |

Every denial appears in that step's `observation.deniedRequests` and in the job's `CleanupReport.deniedRequests`, one entry per distinct URL and reason (repeats are collapsed). Reasons: `host_not_allowed`, `private_range`, `ip_literal`, `non_https`, `bad_port`, `dns_failed`, `byte_cap`.

**Approval tokens.** Import the signer:

```ts
import { signApprovalToken } from "@wallio/runner/approval";
const approvalToken = signApprovalToken(process.env.RUNNER_APPROVAL_KEY!, {
  jobId, actionId, elementRef,           // the exact click you will send
  pageFingerprint: obs.pageFingerprint,  // from the observation the user approved
}, 300);                                 // seconds; the runner caps at 600
```

The runner checks the signature, expiry, job, action and element, and that the page **including current field values** still has the approved fingerprint. It allows each token once. Any submit control without a valid token is refused with `approval_token_invalid` (status `denied`). Do a `fill` → take the fingerprint from that result → show the user → sign → `click`.

**Eval page timing.** The contract has no `wait`. After a click the runner waits until the page stops changing (1 s with no DOM mutations, max 6 s). It also waits while any element has `aria-busy="true"` (max 15 s). **Please set `aria-busy="true"` on the eval result region while the test runs**, and give it `data-testid="eval-result"`. If inference can take longer than 15 s, I'd still like to add `{ type: "wait", ms ≤ 15000 }` in contracts v0.2.

**Screenshots.** Fetch `GET /artifacts/:artifactId` right after the action. The response is checked PNG with an `x-content-sha256` header that matches `observation.screenshot.sha256`. Files are kept 30 minutes after the job is cleaned, then deleted.

**Timeouts.** The agent allows navigate 30 s (40 s total), click 20 s, others ≤ 20 s, and the daemon adds a 5 s watchdog. Use an HTTP client timeout of **≥ 50 s** for `/actions`. Cancel returns 202; poll `GET /jobs/:id/cleanup` until `status` is not `pending`.

**Error meanings** (`RunnerActionResult.error.code`):

| Code | Status | Meaning | Retry? |
|---|---|---|---|
| `egress_denied` | denied | Navigation target refused (runner policy or proxy) | no |
| `approval_token_invalid` | denied | Missing, bad, expired, wrong element, page changed, or already used | no; new intent |
| `invalid_action` | failed | Credential field, not a text field, or `stepIndex` went backwards | no |
| `navigation_failed` | failed | DNS/TLS/connection error | yes, ≤ 2 |
| `element_stale` / `element_not_found` | failed | Ref from before the last navigation / not in last inspect | after `inspect` |
| `action_timeout` | timeout | Action took too long; job still usable unless the runner had to stop the browser | read-only only |
| `deadline_exceeded` | timeout | Job hit its hard deadline; container killed and cleaned | no |
| `action_limit_reached` / `screenshot_limit_reached` | failed | Budget used up | no |
| `browser_crashed` | failed | Browser or container died; job is being cleaned | no |
| `cancelled` | failed | Job cancelled while or before this action ran | no |
| `internal` | failed | Runner bug; observation withheld | no |

HTTP errors (`RunnerHttpError`): `401 unauthorized`, `400 bad_request` (schema), `409 busy` (one job per runner, or still cleaning), `503 busy` (paused after a cleanup failure), `404 job_not_found`, `409 job_not_ready` (still starting or already finished).

Blocked pages (captcha, login wall, MFA, 401/403/429, download) return `status: "ok"` with `observation.blocked` set. The runner stops there and never tries to get past them.

**Idempotency.** Re-sending an `actionId` returns the stored result and never re-executes, even across a daemon restart. Reusing an `actionId` for a different action is a 409. `stepIndex` may not go backwards.

## Measured on 5 Nov 2026 (local Docker Desktop, arm64)

| | Value |
|---|---|
| Container start to ready | 0.5–0.9 s |
| Navigate Copilot / Zed pricing | ~3.0 s / ~2.8 s |
| Peak per job | ~290 MiB memory, ~91 processes |
| Limits applied | 1536 MiB, 1 CPU, 192 processes, 256 MB tmp, 50 MB egress |

These need re-measuring on the Vultr VM (x86).

## Containment demo (≈35 s of the video, PRD §24 2:45–3:20)

1. Show the hostile page screenshot (`samples/containment-page.png` locally, live from `hostile.<domain>` on Vultr). Say: *"This page tries to hijack the agent: a fake system override, a button that posts to a private server, and background requests to cloud metadata."*
2. Show the run's evidence. The injection text comes back as **data**. `inspect` shows the button's target is a private IP, so the control plane refuses to click. A plain button that navigates to metadata is clicked and the **proxy** refuses it (`egress_denied`).
3. Show the denial list: private ranges, cloud metadata, localhost, `exfil.attacker.example`.
4. Show the sentinel count still at **0**, and that the sentinel *is* reachable from the runner host (`/ping`), so 0 means the policy held.
5. Show `/healthz` ok, the app still responding, and the cleanup report: container and volume removed and verified absent.

Label it a **controlled containment test, not proof of invulnerability**.

## Deploying on Vultr

Prerequisites: runner VM (Ubuntu 24.04, 2 vCPU / 4 GB), same region and VPC as the control VM. Firewall group: SSH from your IP only, nothing else public.

```bash
deploy/runner/setup-runner.sh <runner-public-ip> <runner-private-ip> <control-private-ip>
deploy/runner/deploy-runner.sh <runner-public-ip>
deploy/runner/push-runner-secrets.sh <runner-public-ip> <control-public-ip>
```

On the control VM (Anish):
- Add `deploy/runner/Caddyfile.hostile` to the Caddyfile, after writing `fixtures/hostile/config.js` with the sentinel URL.
- Install `deploy/runner/wallio-sentinel.service` bound to the private IP, and allow 9099 from the runner's private IP only.

Then from the control VM:

```bash
RUNNER_URL=https://<runner-private-ip>:8443 NODE_EXTRA_CA_CERTS=/etc/wallio/runner-cert.pem RUNNER_SHARED_TOKEN=... \
HOSTILE_URL=https://hostile.<domain>/ SENTINEL_URL=http://<control-private-ip>:9099 npm run smoke -w @wallio/runner
```

Check from outside that `https://<runner-public-ip>:8443` does not answer.

## Threat model and limits (be honest in the demo)

- **Containers share the runner VM's kernel.** A Chromium + kernel exploit chain could escape. That is why the runner VM holds no keys, runs only the runner, and only takes public, synthetic work (PRD §13 "isolation limits").
- **The daemon is in the `docker` group**, which is root-equivalent on that VM. Rootless Docker or gVisor would be the next step.
- **The browser runs JavaScript from allowlisted sites.** It can only talk to those hosts on 443. It cannot reach metadata, the VPC, the host or other sites.
- **Allowlisted sites can still show misleading content.** Observations are untrusted data. The runner never acts on page text, and the control plane must not either.
- **Test mode** (fixture host mapping) is refused when `NODE_ENV=production`.
- **One job at a time** per runner, by design (PRD §19).

## Files

| Path | What |
|---|---|
| `src/server.ts`, `src/main.ts` | HTTP API (Hono), entry point |
| `src/jobs/service.ts` | Lifecycle, limits, policy, approvals, cleanup, recovery, sweeper |
| `src/sandbox/docker.ts`, `channel.ts` | Docker driver, stdio channel to the agent |
| `src/egress/` | Proxy, IP/host policy, proxy control client |
| `src/approval/token.ts` | Token signer/verifier (`@wallio/runner/approval`) |
| `src/drivers/fake.ts` | No-Docker driver for integration |
| `agent/` | In-container Playwright agent (its own pinned lockfile) |
| `image/` | Dockerfiles, Playwright seccomp profile |
| `fixtures/hostile/` | Containment page |
| `sentinel/` | Sentinel for the control VM |
| `scripts/` | Image build, smoke, preflight |
| `samples/` | Real outputs from fixture pages, for the UI |
| `../../deploy/runner/` | VM bootstrap, firewall, systemd, deploy |
