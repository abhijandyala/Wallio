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
| 2026-11-05 23:00:05 | post-p9 | mock | CLEANED/succeeded, 8s, 3 ev | succeeded, simulated, 2.4s | contained, 3 refused, 3s | pass |
| 2026-11-05 23:00:18 | post-p9 | mock | CLEANED/succeeded, 7.9s, 3 ev | succeeded, simulated, 2.5s | contained, 3 refused, 2.9s | pass |
| 2026-11-06 00:39:36 | post-runner-merge | mock | CLEANED/succeeded, 7.9s, 3 ev | succeeded, simulated, 2.5s | contained, 3 refused, 3.1s | pass |
| 2026-11-06 01:08:09 | first-live | live | CLEANED/succeeded, 23.3s, 3 ev | succeeded, submitted, 6.3s | contained, 3 refused, 4.2s | pass |
| 2026-11-06 01:23:05 | r7 | live | CLEANED/succeeded, 23.8s, 3 ev | succeeded, submitted, 6.7s | contained, 3 refused, 4.1s | pass |
| 2026-11-06 01:23:40 | r7 | live | CLEANED/succeeded, 22.3s, 3 ev | succeeded, submitted, 6.7s | contained, 3 refused, 4.2s | pass |
| 2026-11-06 01:24:13 | r7 | live | CLEANED/succeeded, 21.8s, 3 ev | succeeded, submitted, 6.6s | contained, 3 refused, 4.1s | pass |
| 2026-11-06 01:24:46 | r7 | live | CLEANED/succeeded, 22s, 3 ev | succeeded, submitted, 6.9s | contained, 3 refused, 3.5s | pass |
| 2026-11-06 01:25:18 | r7 | live | CLEANED/succeeded, 22.5s, 3 ev | succeeded, submitted, 6.8s | contained, 3 refused, 4s | pass |
| 2026-11-06 01:25:52 | r7 | live | CLEANED/succeeded, 49.8s, 5 ev | succeeded, submitted, 6.8s | contained, 3 refused, 4.2s | pass |
| 2026-11-06 01:26:53 | r7 | live | CLEANED/succeeded, 22.3s, 3 ev | succeeded, submitted, 7s | contained, 3 refused, 4.1s | pass |
| 2026-11-06 01:27:27 | r7 | live | CLEANED/succeeded, 23.9s, 3 ev | succeeded, submitted, 6.9s | contained, 3 refused, 4.1s | pass |
| 2026-11-06 01:28:02 | r7 | live | CLEANED/succeeded, 23.6s, 3 ev | succeeded, submitted, 6.8s | contained, 3 refused, 4.2s | pass |
