# Wallio

A personal AI manager: it finds, compares and tests AI tools for your work, then explains what to keep, try, replace or review, with receipts. Built for the Vultr Agent Rush hackathon (Blast Radius Zero track).

**Live:** https://149-28-76-16.sslip.io (API health: `/api/health`, which also reports `runMode`).

## Repository layout

| Path | What | Owner |
|---|---|---|
| `web` | Product interface (Next.js). `/` is the landing page, the app is at `/home`. See `web/README.md` | Abhi |
| `packages/api` | Backend: API, Postgres with row-level security, run orchestrator, Vultr inference gateway, research, scoring, approvals, owned pages | Anish |
| `packages/runner` | Browser runner daemon: one isolated Chromium container per job behind an egress allowlist proxy. See `packages/runner/README.md` | Adhvik |
| `packages/mcp` | MCP connector: lets Claude, Claude Code or Cursor read your Wallio wallet and start a comparison. See `packages/mcp/README.md` | Adhvik |
| `packages/contracts` | Shared schemas between the UI, the API and the runner (zod + generated JSON Schema + fixtures) | Anish |
| `deploy/` | Control VM setup, deploy, secrets, demo reset, secret check, rehearsals. `deploy/runner/` is the runner VM | Anish, Adhvik |
| `docs/` | `GOLDEN_PATH.md` (the demo journey), `CONTRACTS.md` (endpoints and protocols), `ARCHITECTURE.md` (how a run flows), `BACKEND.md` (approval gate, containment, scoring), `DEMO_SCRIPT.md`, `REHEARSALS.md`, `DESIGN.md` (UI design system) | all |

## How Wallio uses Vultr

| Vultr service | Role in Wallio |
|---|---|
| **Serverless Inference** (`api.vultrinference.com`, model pinned to `qwen3.8-flash-next`) | Every agent model call: research planning, reading vendor pages (each finding must quote the page), the owned coding task, and the written explanation. The gateway refuses any other inference host, caps output tokens per purpose, retries at most twice, and records tokens and cost per call. See `docs/VULTR_INFERENCE.md` |
| **Cloud Compute: control VM** (vc2-2c-4gb, Los Angeles, Ubuntu 24.04) | Caddy (TLS, the only public port), the web app, the API, Postgres, and Wallio's own pages on `eval.`, `forms.` and `hostile.` subdomains. Deployed with `deploy/deploy.sh` |
| **Cloud Compute: runner VM** (same region) | The browser runner: a fresh, locked-down Chromium container per job, no keys, egress only to that job's allowlisted hosts |
| **VPC** `wallio-vpc` (10.5.96.0/20) | The only path from the API to the runner (HTTPS with a pinned certificate) and from the runner to the containment sentinel |
| **Firewall groups** | Control VM: 443 from anywhere, SSH from the admin IP only. Runner VM: nothing public except admin SSH |

## Browser runner: how the blast radius stays small

Every browser action runs on a separate runner VM that holds no provider, inference or cloud keys. Each job gets a fresh Chromium container that can only reach the internet through a proxy, and only the hosts that job was given.

```
Control VM 10.5.96.3                              Runner VM 10.5.96.4 (no public ports)
  API ── HTTPS :8443 over the VPC ─────────────▶  runner daemon (systemd, own user)  
         pinned cert, bearer token,                 │  docker run -i: JSON over stdio,
         one action per request                     │  the container has no listening port
                                                    ▼
                                    job container: Chromium, sandbox on
                                    network wallio-jobs (internal: no route out)
                                                    │  its only peer
                                                    ▼
                                    egress proxy ── CONNECT :443, this job's hosts only ──▶ internet
                                    denies private, loopback, link-local and metadata
                                    addresses after DNS; per-job byte cap; logs each denial
```

| Layer | What it enforces |
|---|---|
| Container | Non-root user, read-only root filesystem, every capability dropped except `SYS_CHROOT` (so Chromium can keep its own sandbox), `no-new-privileges`, a seccomp profile, 1536 MiB memory, 1 CPU, 192 processes, and a tmpfs that is deleted with the job |
| Network | The job network has no route out. The proxy accepts only HTTPS to the job's exact allowlist (for example `github.com` and `github.githubassets.com` for Copilot) and connects to the IP it checked itself, so DNS rebinding can't reach a private address. A host firewall blocks the proxy from the VPC and metadata ranges as a second layer |
| Actions | `navigate`, `inspect`, `fill`, `click`, `scroll`, `screenshot` and `observe`, within limits on actions, screenshots and the deadline. A click on any submit control needs an approval token. The runner checks that token itself: an HMAC bound to the job, the action, the element and the page fingerprint, valid once. Login walls, CAPTCHAs and downloads stop the job; they're never worked around |
| Lifecycle | One job per purpose, one at a time. A deadline and watchdog are enforced in the daemon, outside the browser. Finish, cancel, deadline or crash all end in teardown, and the runner then checks by name and by label that the container and volume are gone. If that check fails, the runner pauses and accepts no new jobs |

Measured on the Vultr runner VM (6 Nov 2026):
- Live smoke and containment: 21/21 pass. Containment: 9 denied requests, the private sentinel unchanged at 0, cleanup verified.
- Container start: 1.9–3.2 s. Peak memory: 566 MiB. Peak processes: 80.
- Port 8443 doesn't answer from the internet.

Details, the runner's threat model and the containment demo script are in `packages/runner/README.md`. Results are in `docs/RUNNER_TEST_REPORT.md`.

## Run the backend locally

Needs Node 22.18+ (runs TypeScript directly) and PostgreSQL 16.

```bash
cp .env.example .env          # fill in VULTR_INFERENCE_API_KEY; the rest has local defaults
npm install
npm run db:setup              # creates the wallio_app role (no superuser, no RLS bypass), migrates, seeds the catalog
npm run api:dev               # http://localhost:8787 (RUN_MODE=mock by default)
```

- `RUN_MODE=mock` plays runs back without a browser or model calls, and every result says it is sample data. The approval gate is still real.
- `RUN_MODE=live` needs `RUNNER_URL` and `RUNNER_SHARED_TOKEN` (Adhvik's runner; `RUNNER_DRIVER=fake` in `packages/runner` gives a local stand-in). Without them, live runs fail honestly with `runner_unavailable`.
- `npm run smoke:inference` checks your inference key against the pinned model (text, JSON and vision).

### Tests

```bash
npm run contracts:test        # 36 contract and fixture tests
npm run api:test              # 101 API tests; needs the wallio_test database from .env.example
npm run typecheck
```

The API tests use a contract-faithful fake runner and fake inference, so they need no keys. They cover tenant isolation, the run lifecycle (queue, lease, deadline, cancel, cleanup), research with prompt injection, grounding and scoring, the approval gate (wrong user, wrong hash, expiry, changed field, double use), containment, the degraded paths, rate limits and the demo reset.

### Environment variables (names only)

| Variable | Purpose |
|---|---|
| `VULTR_INFERENCE_API_KEY`, `VULTR_INFERENCE_BASE_URL` | Vultr Serverless Inference. The base URL is locked to `api.vultrinference.com` |
| `DATABASE_URL`, `DATABASE_ADMIN_URL` (`TEST_` variants for tests) | App role (subject to row-level security) and owner role (migrations only) |
| `RUN_MODE`, `APP_ORIGIN`, `COOKIE_SECURE`, `PORT`, `HOST` | Mode, public origin (CSRF check, owned-page subdomains), cookie flag, bind address (localhost by default) |
| `RUNNER_URL`, `RUNNER_SHARED_TOKEN`, `RUNNER_APPROVAL_KEY`, `RUNNER_CA_FILE`, `RUNNER_TIMEOUT_MS` | Browser runner over the VPC: bearer token, approval-token key, pinned certificate, per-call timeout |
| `EVAL_ORIGIN`, `FORMS_ORIGIN`, `HOSTILE_ORIGIN`, `SENTINEL_URL` | Wallio's own pages (default: `eval.` / `forms.` / `hostile.` + the app host) and the containment sentinel |
| `RUN_SPEND_CAP_MINOR`, `RUN_ESTIMATE_MINOR`, `DAILY_SPEND_CAP_MINOR` | Per-run spend cap, reservation per run, daily kill switch (cents) |
| `RUN_DEADLINE_SECS`, `QUEUE_MAX_WAIT_SECS`, `MAX_QUEUED_RUNS`, `WORKER_LEASE_SECS`, `LIVE_CONCURRENCY`, `CLEANUP_MAX_SECS` | Orchestrator: hard deadline, queue limits, worker lease |
| `APPROVAL_TTL_SECS` | How long a user has to approve an intent |
| `RATE_LIMIT_PER_MINUTE`, `GUESTS_PER_HOUR_PER_IP`, `RUNS_PER_DAY_PER_WORKSPACE`, `RUNS_PER_HOUR_PER_IP` | Guest abuse limits |

`.env.example` has safe local values for all of them. Real secrets live only in your local `.env` (git-ignored) and in root-only `/etc/wallio/api.env` on the server.

## Deploy (Vultr)

```bash
deploy/setup-server.sh <ip> [domain]   # one-time: packages, firewall, Postgres, Caddy, systemd
deploy/push-secrets.sh <ip>            # copies the inference key from .env over SSH (never printed)
deploy/deploy.sh <ip>                  # ships the committed HEAD, migrates, restarts, health-checks
deploy/check-secrets.sh <ip>           # looks for real secret values in git history, logs, the database and API responses
deploy/reset-demo.sh <ip> [--yes]      # deletes only guest demo data (dry run by default)
node deploy/rehearse.ts https://<domain> --count 10   # drives the live site and logs to docs/REHEARSALS.md
```

Only Caddy is public (443). The API listens on 127.0.0.1:8787 as the unprivileged `wallio` user; Postgres is localhost-only; SSH is key-only and limited by the Vultr firewall group to the admin IP.

The control VM's private address is 10.5.96.3. The runner VM joins `wallio-vpc`, and `deploy/runner/push-runner-secrets.sh` writes `RUNNER_URL`, `RUNNER_SHARED_TOKEN`, `RUNNER_APPROVAL_KEY` and `RUNNER_CA_FILE` into `api.env`; the runner's self-signed certificate is trusted through `NODE_EXTRA_CA_CERTS`.

## Threat model (control plane)

What the API assumes is hostile, and what stops it. The runner's own threat model is in `packages/runner/README.md`.

| Threat | Control |
|---|---|
| **Prompt injection in vendor or hostile pages** | Page text is untrusted data. The planner never sees page content. Extraction must quote the page word for word, or the finding is dropped. The model only writes sentences; fixed rules choose the action, and every sentence must cite fact IDs with no new numbers |
| **The agent doing something it shouldn't** | API policy checks every action before it reaches the runner: https only, exact hosts and path prefixes, step and screenshot budgets, a deadline margin. Forms are filled only on Wallio's own trial form and never in credential or payment fields. Anything with an external effect needs approval |
| **Approving one thing and sending another** | The intent (fields, target, element, page fingerprint, screenshot, expiry, nonce) is hashed, and the user must send that hash back. The page is re-checked before the click; any change invalidates the approval. Used once (database-enforced), then the click carries a signed token the runner verifies itself |
| **Reaching private networks or cloud metadata** | The runner's egress proxy allows only the job's hosts on 443 and denies private, link-local and metadata ranges. API policy refuses IP-literal and off-allowlist targets before dispatch. The containment run proves it against a live sentinel |
| **One user reading another's data** | Every table is filtered by tenant, and Postgres row-level security is forced, with the app role unable to bypass it. Another user's run, evidence or approval is a 404 |
| **Runaway cost or abuse** | Per-run spend cap, daily kill switch, queue limit, one active run per workspace, per-IP and per-workspace rate limits, and a model circuit breaker per run |
| **Leaked secrets** | The runner holds no provider or cloud keys. The inference key is only on the control VM (`/etc/wallio/api.env`, mode 600). Model output, run events and evidence never carry tokens; `deploy/check-secrets.sh` verifies this |
| **Runs that hang or die** | A hard deadline enforced outside the executor, a worker lease with recovery that never re-runs, and every runner job id recorded before creation so cleanup can always find and verify it |

## Limitations (honest)

- Vendor facts are what each vendor's own page said at capture time: published claims, not verified behaviour.
- The owned test measures Wallio's harness on a Vultr model with a sample bug, not Copilot, Zed or any other product, and not the user's own code.
- Guest workspaces only (72-hour cookie, no accounts). Subscriptions are typed in; nothing is imported from real accounts.
- The trial request is synthetic and goes to Wallio's own form. Nothing is bought, cancelled or sent to a vendor.
- Containment is a controlled test, not proof of invulnerability: containers share the runner VM's kernel.
- Limits are per API process and reset on restart; the per-workspace quota is durable.

## License

MIT. See `LICENSE`.
