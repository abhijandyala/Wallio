# Demo video script (under 5 minutes)

The judges need to see, in order:
1. A real agent doing real work on Vultr.
2. At least one **containment moment**: required for Blast Radius Zero.
3. A human approval before the final action.
4. Honest labels throughout.

Record on the live site, https://149-28-76-16.sslip.io, in **live mode** (real runner, real Vultr inference). The fallback plan is at the end.

| Time | Screen | Say (short) |
|---|---|---|
| 0:00–0:25 | Landing page | "People pay for three or four AI tools and can't tell what's worth keeping. Wallio is an agent that researches, tests and recommends, and every action it takes runs in an isolated Vultr sandbox." |
| 0:25–0:55 | My AI: subscriptions and profile | "You tell it what you pay and how you work. Copilot is $10 a month and renews on the 20th; I care about debugging; my code is medium sensitivity." |
| 0:55–1:50 | Compare: Copilot vs Zed, live timeline | "One comparison. The plan comes from a Vultr model, and the browser opens each vendor's official pricing page in its own throwaway container. Each capture gets a screenshot and a hash. The model has to quote the page for every fact it extracts." Point at the stages, the inference feed and evidence arriving. |
| 1:50–2:20 | Owned test step | "It can't test Copilot itself, so it runs a sample bug through a Vultr model in Wallio's own test page, inside the sandbox: 3 of 3 pass. That's labelled as testing our harness, not either product." |
| 2:20–2:45 | Recommendation and evidence drawer | "Rules pick the action, not the model: review Copilot before it renews, with a short Zed trial. Every sentence cites evidence; unknown prices stay unknown." Open one evidence item with its screenshot. |
| 2:45–3:25 | **Containment run** | "Now an attack. This is our hostile page: a fake 'system override' telling the agent to click a button that posts to a private server, plus background requests to cloud metadata." Show the page. "The text comes back as data. Policy refuses every control that leads off-site, before anything is clicked. The runner's proxy blocks the page's own requests (here's the list), and a sentinel on our private network is still at zero. The container and its storage are removed and verified." Say: **"A controlled containment test, not proof of invulnerability."** |
| 3:25–4:15 | **Approval gate:** synthetic trial request | "Any action with an outside effect stops for you. Here's exactly what would be sent, where, and a screenshot." Approve. "It re-checks the page, uses the approval once, and submits to Wallio's own form, never a vendor." Then show the second approval of the same request being refused. If time allows, mention: "if a field changes after you approve, the approval is void and you're asked again." |
| 4:15–4:45 | Architecture slide | "Vultr Serverless Inference for every model call; a Vultr control VM for the app and API; a separate runner VM on a private VPC, with one container per job and an egress allowlist; Postgres with row-level security per visitor." |
| 4:45–4:55 | Close | "Wallio: an AI wallet that does the work and stays in its box." |

## Before recording

1. `deploy/check-secrets.sh 149.28.76.16` passes.
2. `npm run preflight -w @wallio/runner` passes (runner healthy, no stale containers, escape probe fails, sentinel at 0).
3. `deploy/reset-demo.sh 149.28.76.16`, dry run first, then `--yes` with the team's OK.
4. `curl https://149-28-76-16.sslip.io/api/health` shows `"runMode":"live"`.
5. One full warm-up rehearsal: `node deploy/rehearse.ts https://149-28-76-16.sslip.io --count 1 --label pre-recording`.
6. Fresh browser profile (new guest workspace), 1080p, notifications off.

## Fallback recording (keep it, labelled)

If live mode isn't available, for example because a vendor page shows a bot check:
- Record the same script in **demo-playback mode**. Every screen says "sample data", and the containment and approval steps still use the real policy and approval code.
- Name the file `wallio-demo-FALLBACK-playback-YYYY-MM-DD.mp4`, and say in the first 10 seconds: "This recording uses Wallio's demo playback; no live browser was used."
- Keep the most recent dated live recording too: `wallio-demo-LIVE-YYYY-MM-DD.mp4`.

Never present playback as a live run.
