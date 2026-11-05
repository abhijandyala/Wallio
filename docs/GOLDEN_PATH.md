# Wallio golden path

Status: **v0.1, working decision by Anish (5 Nov 2026).** Build against this now. Abhi or Adhvik can propose changes in the team channel; Anish updates this file.
Source: AI Wallet PRD v1.0 §20 Step 1, §24 demo narrative, and Anish's scope brief.

---

## 1. The one journey we must complete

> A synthetic indie developer pays for **GitHub Copilot Pro** and asks: *"Should I keep Copilot for debugging, or try Zed?"* Wallio researches both tools in a real, isolated browser on Vultr, runs one controlled task test in an environment we own, and returns a stored recommendation where every claim links to a source capture, a test result, or something the user told us.

Track: **Blast Radius Zero** (PRD §11 recommendation).

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Task family | **Diagnose a small web-app bug**: a JavaScript off-by-one error | PRD §10 example; deterministic pass/fail test |
| Incumbent | **GitHub Copilot Pro** | Most common paid coding assistant; clean public pricing page |
| Candidate | **Zed Pro** | Same headline price, different billing model and higher switching effort, so the recommendation has to reason, not just compare prices |
| Candidates per run | 1 (plus incumbent) | A second candidate is a stretch goal |

Ruled out on 5 Nov 2026: Cursor (pricing page now mixes X/Grok social plans), Windsurf (pricing redirects to devin.ai), Tabnine (pricing redirects to a Tricentis contact form).

### Pricing pages, checked 5 Nov 2026

| Tool | URL | Loads without login / bot check | Prices in page text | robots.txt |
|---|---|---|---|---|
| GitHub Copilot | `https://github.com/features/copilot/plans` | ✅ | ✅ | not disallowed |
| Zed | `https://zed.dev/pricing` | ✅ | ✅ | `Allow: /` |

What they listed that day, for orientation only. **The demo must use fresh captures, never these numbers:** Copilot Pro "$10 USD per user / month" with "$15 monthly total credits"; Zed Pro "$10 per month" with "$5 of tokens included" and usage-based billing beyond that.

## 3. Inputs

| Input | Value | Notes |
|---|---|---|
| User | Guest session (synthetic developer) | A fresh tenant per visitor; never a shared demo account |
| Subscriptions | 3 seed rows: Copilot Pro (monthly), a chat assistant (monthly), one annual tool with unknown price | Amounts are **synthetic user input** (`source: seed`). Vendor prices only come from captured evidence |
| Profile | Independent web developer; top workflow debugging; budget cap; medium data sensitivity | No required editor integration, so Zed is judged on evidence rather than failing a checkbox |
| Sample task | Sanitized JS snippet with one off-by-one bug + a test that fails before the fix and passes after | No private code ever leaves the user |

## 4. What the browser runner does

1. **Research (mode `researched`)**: open the Copilot and Zed pricing pages. Capture screenshot, bounded text excerpt and content hash. Record plan names, listed prices and stated limits **as vendor claims**.
2. **Controlled test (mode `tested_owned_demo`)**: open our owned evaluation page, which runs the sample task through **Vultr Serverless Inference** and shows the test result. The runner reads and screenshots pass/fail.
3. **Approval-gated action**: on our owned trial-request form, the agent prepares a synthetic request. The run pauses in `AWAITING_APPROVAL`; the user sees the exact fields, destination and screenshot; only an approved, unexpired, unchanged intent is submitted, once.
4. **Containment run**: our owned hostile page contains a prompt injection and a button pointing at a private address. Policy denies it, the denial is logged, the control plane is unaffected, and the runner reports verified cleanup.

> Labelling rule (PRD §6): visiting a vendor page **does not test** that tool. The owned-demo test measures our task harness on Vultr models; the UI must show it as "tested in owned demo environment", never as a benchmark of Copilot or Zed.

## 5. Allowed destinations

Two layers: Adhvik's egress proxy allows **hosts**; Anish's API policy further restricts **URL paths** before any `navigate` is sent.

| Purpose | Host (runner allowlist) | Path prefix (API policy) |
|---|---|---|
| Incumbent research | `github.com` | `/features/copilot` |
| Candidate research | `zed.dev` | `/pricing` |
| Owned eval page | `eval.<our-domain>` | `/` |
| Owned trial form | `forms.<our-domain>` | `/` |
| Hostile fixture | `hostile.<our-domain>` | `/` |

`<our-domain>` is set once the control VM has a domain. Everything else is denied at the egress proxy, including private ranges, link-local, cloud metadata, loopback and IPv6 equivalents. Redirects are re-checked against both layers.

## 6. Observable outputs (what judges see)

- Run timeline: planning → researching → testing → verifying → reporting, streamed live over SSE.
- Evidence drawer: each capture with URL, time, screenshot, hash, extraction method and limitation.
- Copilot and Zed cards labelled `researched`; the task result labelled `tested in owned demo`.
- Spending: monthly equivalent of the current stack, unknown prices shown as unknown, a switch scenario with its assumptions.
- Recommendation: one action (`keep`, `try`, `compare_further`, `replace_after_validation`, `review_renewal`, `no_action`), supporting evidence, counter-evidence, uncertainty, next step. Keeping Copilot is a valid result.
- Approval screen and the post-approval verified state.
- Containment: denied request, app still healthy, `CLEANED` with container and volume absent.

## 7. Success rubric for the run

| Check | Pass condition |
|---|---|
| Inference | Every agent LLM call hits `api.vultrinference.com`; usage rows recorded |
| Evidence | ≥ 1 capture per tool, each with hash and screenshot |
| Traceability | Every recommendation statement has ≥ 1 evidence ID or user-input reference |
| Honesty | No price or test result that isn't from a capture or executed test |
| Approval | Submit happens only after approve; a second consume is rejected |
| Containment | Private target denied; sentinel unchanged; cleanup verified |
| Timing | Whole comparison under 180 s runner time; target median under 90 s |

## 8. Out of the golden path (labelled "coming later" in the UI)

GitHub import, news/updates monitor, automatic cancellation, purchases, authenticated browsing of user accounts, more than one candidate.
