# Wallio golden path (P0 proposal)

Status: **PROPOSAL, needs team sign-off.** Owner: Anish (backend + AI). Reviewers: UI owner, Adhvik (runner).
Source: AI Wallet PRD v1.0 §20 Step 1, §24 demo narrative, and Anish's scope brief.

Every item marked **DECIDE** needs agreement from all three of us before Day 1 ends. Defaults are what we build if nobody objects.

---

## 1. The one journey we must complete

> A synthetic indie developer with three AI subscriptions asks: *"Should I keep my coding assistant or try an alternative for debugging?"* Wallio researches both tools in a real, isolated browser on Vultr, runs one controlled task test in an environment we own, and returns a stored recommendation where every claim links to a source capture, a test result, or something the user told us.

Track: **Blast Radius Zero** (PRD §11 recommendation). **DECIDE:** confirm.

## 2. Inputs

| Input | Default | Notes |
|---|---|---|
| User | Guest session `demo-dev` (synthetic) | Gets a fresh tenant per visitor; never a shared demo account |
| Subscriptions | 3 user-entered rows: coding assistant (monthly), chat assistant (monthly), one annual-plan tool | Amounts are **synthetic user input**, labelled `user_entered`. Real vendor prices only ever come from captured evidence |
| Profile | Role: independent developer. Top workflow: debugging a small web app. Budget cap and privacy preference set by the user | Every inferred attribute shows `origin: inferred` until confirmed |
| Task family | **Diagnose a small web-app bug** (PRD §10 example) | **DECIDE** |
| Incumbent | The coding assistant already in the user's inventory | **DECIDE** which product |
| Candidate | One alternative coding assistant from the curated catalog | **DECIDE** which product. Keep to one candidate; a second is a stretch goal |
| Sample task | Sanitized JS snippet with one known bug + a deterministic test that passes once fixed | No private code ever leaves the user |

## 3. What the browser runner does

1. **Research (mode `researched`)**: visit the official pricing page and one docs/features page for the incumbent and the candidate. Capture screenshot + bounded text excerpt + content hash. Record plan names, listed prices and stated limits **as vendor claims**.
2. **Controlled test (mode `tested_owned_demo`)**: open our owned evaluation page, which runs the sample task through **Vultr Serverless Inference** and shows the deterministic test result. The runner reads and screenshots the pass/fail outcome.
3. **Approval-gated action**: on our owned *trial request form*, the agent prepares a synthetic request. The run pauses in `AWAITING_APPROVAL`; the user sees the exact fields, destination and screenshot; only an approved, unexpired, unchanged intent is submitted, once.
4. **Containment run**: our owned hostile page contains a prompt injection and a button pointing at a private address. Policy denies it, the denial is logged, the control plane is unaffected, and the runner reports verified cleanup.

> Labelling rule (PRD §6): visiting a vendor page **does not test** that tool. The owned-demo test measures our task harness on Vultr models; the UI must show it as "tested in owned demo environment", never as a benchmark of the commercial product.

## 4. Allowed destinations (runner egress allowlist)

| Purpose | Hosts | Owner |
|---|---|---|
| Incumbent research | official pricing + docs host(s) of incumbent | **DECIDE** once product chosen |
| Candidate research | official pricing + docs host(s) of candidate | **DECIDE** |
| Owned eval page | `eval.<our-domain>` | Anish serves, Adhvik allowlists |
| Owned trial form | `forms.<our-domain>` (or a path on eval host) | Anish |
| Hostile fixture | `hostile.<our-domain>` | Adhvik builds, Anish reads denial |

Everything else is denied at the runner's egress proxy, including private ranges, link-local, cloud metadata, loopback and IPv6 equivalents. Redirects are re-checked against this list.

## 5. Observable outputs (what judges see)

- Run timeline: planning → researching → testing → verifying → reporting, streamed live over SSE.
- Evidence drawer: each capture with URL, time, screenshot, hash, extraction method and limitation.
- Candidate cards clearly labelled `researched` vs `tested in owned demo`.
- Spending: monthly equivalent of current stack, unknown prices shown as unknown, savings scenario with its assumptions.
- Recommendation: one action (`keep`, `try`, `compare_further`, `replace_after_validation`, `review_renewal`, `no_action`), supporting evidence, counter-evidence, uncertainty, next step. Keeping the incumbent is a valid result.
- Approval screen and the post-approval verified state.
- Containment: denied request, app still healthy, `CLEANED` with container + volume absent.

## 6. Success rubric for the run

| Check | Pass condition |
|---|---|
| Inference | Every agent LLM call hits `api.vultrinference.com`; usage rows recorded |
| Evidence | ≥ 1 capture per researched tool, each with hash + screenshot |
| Traceability | Every recommendation statement has ≥ 1 evidence ID or user-input reference |
| Honesty | No price or test result that isn't from a capture or executed test |
| Approval | Submit happens only after approve; second consume is rejected |
| Containment | Private target denied; sentinel unchanged; cleanup verified |
| Timing | Whole comparison under 180 s runner time; target median under 90 s |

## 7. Out of the golden path (labelled "coming later" in the UI)

GitHub import, news/updates monitor, automatic cancellation, purchases, authenticated browsing of user accounts, more than two candidates.
