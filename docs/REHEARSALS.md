# Deployed rehearsals

One row per rehearsal, written by `deploy/rehearse.ts`. Raw results are in `docs/rehearsals/`.

**What the 5 Nov 2026 rows cover:** the deployed control plane on Vultr (HTTPS, guest sessions, queue and worker, SSE, approval gate, containment flow, cleanup) in **demo-playback mode**: no browser and no model calls; every result says so. Each rehearsal uses a fresh guest workspace and runs a comparison, an approval-gated trial request (approve, then a second approve that must be refused), and a containment run. The degraded row switches the server to live mode with no browser runner configured: the comparison must fail honestly (`runner_unavailable`) and still end `CLEANED`.

**Still to do:** the same 10 rehearsals in live mode (real Vultr inference and Adhvik's browser runner), once the runner VM is up.

| When (UTC) | Label | Mode | Comparison | Trial (approval) | Containment | Result |
|---|---|---|---|---|---|---|
| 2026-11-05 22:29:35 | cold-start | mock | CLEANED/succeeded, 7.8s, 3 ev | succeeded, simulated, 1.6s | contained, 3 refused, 2.9s | pass |
| 2026-11-05 22:29:55 | standard | mock | CLEANED/succeeded, 8.4s, 3 ev | succeeded, simulated, 2.5s | contained, 3 refused, 2.9s | pass |
| 2026-11-05 22:30:08 | standard | mock | CLEANED/succeeded, 7.7s, 3 ev | succeeded, simulated, 2.5s | contained, 3 refused, 2.9s | pass |
| 2026-11-05 22:30:22 | standard | mock | CLEANED/succeeded, 7.3s, 3 ev | succeeded, simulated, 2s | contained, 3 refused, 2.9s | pass |
| 2026-11-05 22:30:34 | standard | mock | CLEANED/succeeded, 7.8s, 3 ev | succeeded, simulated, 2s | contained, 3 refused, 2.4s | pass |
| 2026-11-05 22:30:47 | standard | mock | CLEANED/succeeded, 7.5s, 3 ev | succeeded, simulated, 2.4s | contained, 3 refused, 2.5s | pass |
| 2026-11-05 22:30:59 | standard | mock | CLEANED/succeeded, 8s, 3 ev | succeeded, simulated, 2.3s | contained, 3 refused, 3s | pass |
| 2026-11-05 22:31:13 | standard | mock | CLEANED/succeeded, 7.8s, 3 ev | succeeded, simulated, 2.6s | contained, 3 refused, 3.2s | pass |
| 2026-11-05 22:31:27 | standard | mock | CLEANED/succeeded, 7.5s, 3 ev | succeeded, simulated, 2.5s | contained, 3 refused, 3s | pass |
| 2026-11-05 22:32:23 | degraded-runner-down | live | CLEANED/failed, 1.1s, 0 ev, runner_unavailable | – | – | pass |
