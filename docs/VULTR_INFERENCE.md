# Vultr Serverless Inference in Wallio

Every agent model call goes to **Vultr Serverless Inference**. There is no other model provider in the code.

## How it's wired

- **One gateway** (`packages/api/src/inference/gateway.ts`) for every call. It refuses any base URL other than `https://api.vultrinference.com/v1` (`assertVultrInferenceUrl`), so a misconfiguration can't silently send data elsewhere.
- **Pinned model:** `qwen3.8-flash-next` for text, JSON and vision (`packages/api/src/inference/pinned-models.json`), with JSON mode on and reasoning off, so output tokens go to the answer.
- **Per-purpose output caps:** plan 3000, extract 3000, verify 1500, explain 3000, task 2000 tokens.
- **Retries:** at most two, only on 429/5xx or network errors. One JSON repair attempt.
- **Circuit breaker per run:** after one "unavailable" error, the rest of the run uses its fallbacks (default plan, template explanation) instead of retrying, and the result is marked partial.
- **Every call is recorded** in `inference_usage`: purpose, model, ok/error, attempts, latency, prompt and completion tokens, estimated cost, and the run's correlation ID. Prompts and outputs are not stored there.
- **Spend:** each call is charged against the run's cap (default 50¢), and the daily kill switch (default $5) stops new runs.

## What the model does, and what it is not allowed to do

| Purpose | What it does | Guardrail |
|---|---|---|
| `plan` | Picks which official pages to read and what to ask, from the tool names, the user's profile and the allowed URLs | Never sees page content. Its URLs are re-checked against policy, and anything off-allowlist is refused and logged |
| `extract` | Reads a captured vendor page, given as delimited untrusted data, and answers the plan's questions | Every finding must quote the page word for word, or it is dropped |
| `task` | Fixes a sample JavaScript bug for the owned test | The code runs only in the runner's browser, under a no-network CSP, never on the server |
| `explain` | Writes the recommendation's sentences after fixed rules have chosen the action | Every sentence must cite fact IDs and may not introduce numbers missing from those facts. Otherwise a cited template is used |

## Evidence

**Capability gate** (`npm run smoke:inference`, 5 Nov 2026, against the live endpoint): text, structured output (prompt-only and JSON mode) and vision all **PASS** for the candidate models. The pinned `qwen3.8-flash-next` answered text in about 0.7 s and returned a 7-step plan that stayed on the allowed URLs. The latest report is in `packages/api/inference-gate-report.json`.

**One live comparison** (Copilot vs Zed, 5 Nov 2026; real Vultr inference, browser via the runner daemon):

| Purpose | Calls | Prompt tokens | Completion tokens | Avg latency | Cost |
|---|---:|---:|---:|---:|---:|
| plan | 1 | 369 | 402 | 1.5 s | $0.000117 |
| extract | 2 | 654 | 671 | 1.1 s | $0.000199 |
| task | 1 | 132 | 26 | 0.4 s | $0.000018 |
| explain | 1 | 419 | 228 | 0.9 s | $0.000088 |
| **Total** | **5** | **1,574** | **1,327** | | **$0.00042** |

At about $0.0004 of inference per comparison, the $5 daily ceiling covers roughly ten thousand comparisons. The ceiling exists to cap abuse, not to ration normal use.

**Model behaviour on real vendor pages** (5 Nov 2026):
- **Extraction:** 8 grounded findings from the real Copilot and Zed pricing pages, with 0 dropped.
- **Explanation:** fully cited after at most one repair.
- **Owned test:** the model's fix for the sample bug passed 3/3 test cases in 3 of 3 runs, while the original bug passes 1/3.
- **Prompt injection:** in tests, injected instructions and invented quotes never reach the browser or the recommendation (`packages/api/test/research.test.ts`).
