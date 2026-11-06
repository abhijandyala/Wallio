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

Not yet tested: anything on Vultr (x86 VM, VPC, ufw, TLS pinning from the control VM, deployed hostile page + sentinel), and the 10 deployed rehearsals.
