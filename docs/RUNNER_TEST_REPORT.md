# Runner test report

Measured results only (PRD §19). Each entry gives its commit, environment, sample size and failures.

## 5 Nov 2026 · local · commit 333dc41

Environment: macOS, Docker Desktop 29.9.2 (linux/arm64, 10 CPUs, 8 GB VM). Images: Playwright v1.64.1-noble (index digest pinned), node 24-slim.

| Suite | Result | Notes |
|---|---|---|
| Unit (no Docker) | 37/37 pass | IP policy, approval tokens, proxy, daemon through the fake driver |
| Docker integration | 13/13 pass | hardening, escape probe, egress denials, blocked pages, approval form, eval page, containment, cancel, deadline, crash, sweeper, restart recovery |
| Live smoke (real Copilot + Zed pages) | 12/12 pass, 2 runs | containment skipped (needs the deployed hostile page) |
| Preflight | all pass | memory check skipped on macOS |
| Host firewall script | applied twice, same rules | privileged Ubuntu 24.04 container; not yet on the VM |

Measured per job: container start 0.5–0.9 s; navigate ~3 s; peak 250–370 MiB and ~89–91 processes.

Failures found and fixed while testing:
- The submit button's target host was reported as the page itself (DOM `formAction` falls back to the page URL). That would have hidden a private target from policy. Fixed and covered by the containment test.
- A click on a page that updates later returned before the result appeared. Added a settle step that honors `aria-busy`.
- One denied asset host produced 150 identical denial entries. These are now collapsed to one per URL and reason.

## Vultr runner VM, 6 Nov 2026 (UTC)

Commit `1ff5620`. VM `wallio-runner` (vc2-2c-4gb, Ubuntu 24.04, Los Angeles), public 45.32.80.4, private 10.5.96.4 on `wallio-vpc`. Docker 29.9.3, Node 24.22.2.

| Check | Result | Notes |
|---|---|---|
| Bootstrap (`setup-runner.sh`) | pass | ufw allows SSH from 2 admin IPs only, and 8443 from 10.5.96.3 only. The certificate's SAN is `IP:10.5.96.4`. Secrets were generated on the VM |
| Deploy (`deploy-runner.sh`) | pass | Images were built from pinned digests, and the daemon became healthy within about 3 s |
| Preflight on the VM | 11/11 pass | Includes both escape probes (direct internet, cloud metadata) and the image digest match |
| 8443 from the public internet | no answer | `curl` timed out from outside |
| Live smoke + containment | 21/21 pass | Real Copilot + Zed pages, and the deployed `hostile.149-28-76-16.sslip.io`. 9 denials, sentinel `10.5.96.3:9099` stayed at 0 and was reachable from the runner host. Cancel and deadline paths cleaned up and verified |

Measured on the VM (x86):
- Container start: 1.9–3.2 s.
- Navigate: Copilot 5.7 s, Zed 1.7 s.
- Peak memory: Copilot 566 MiB, Zed 245 MiB, hostile page 173 MiB.
- Peak processes: 75–80.

The 1536 MiB and 192-process limits leave room on every page.

After deploy, Anish pushed the secrets and pinned the certificate on the control VM. `/healthz` works over the VPC: it returns 401 without a token and can't be reached from the internet. The eval host returning 404 at its root is by design: it only serves `/eval/<one-time token>` URLs that the API creates for each comparison.

## R7: deployed rehearsals, 6 Nov 2026 (UTC)

Driven by `node deploy/rehearse.ts https://149-28-76-16.sslip.io` from the control plane, in live mode with the real runner and Vultr inference. Each row is in `docs/REHEARSALS.md` on Anish's branch.

| Run | Result | Notes |
|---|---|---|
| First live run + 9 × `r7` | **10/10 pass** | Each comparison ran 3 runner jobs, eval included, in 22–24 s; run 6 took 50 s because the planner chose 4 pages instead of 2. 0 uncited statements. Trial: one submission per run, accepted by the runner's token verifier, and the replayed token got 409. Containment every time: 3 refused by API policy, 9 denied by the proxy, sentinel 0/0, cleanup verified |
| Degraded: runner stopped (`--expect-failure runner_unavailable`) | **pass on the 2nd try** | The 1st try failed honestly with `runner_unavailable`, but the API marked the run `CLEANUP_FAILED`: a refused connection leaves no job to verify. Anish fixed it in `6dfd5bf`. The 2nd try ended `CLEANED` with `runner_unavailable`, 0 evidence and no recommendation |

Runner side, watched every minute from 00:58 to 02:10 UTC with `deploy/runner/check-runner.sh`:
- 55 jobs were cleaned and verified, and there were no leftover containers or volumes at any check.
- The sentinel stayed at 0 throughout. The runner was never paused. The only warnings were the deliberate cancel and deadline smoke tests.
- The runner was stopped from 01:30:34 to 04:40 UTC for the degraded case. On restart it was healthy within 2 s, and preflight passed 13/13, including the sentinel being reachable and at 0.

Limitations: containers share the runner VM's kernel, so this is a controlled containment test, not proof of invulnerability. All of the above was run by the team against our own pages and two public pricing pages.
