/**
 * Inference configuration. Every runtime agent LLM call must go to Vultr
 * Serverless Inference (event rule + PRD §17). This module refuses anything else.
 */

export const VULTR_INFERENCE_ORIGIN = "https://api.vultrinference.com";
export const DEFAULT_BASE_URL = `${VULTR_INFERENCE_ORIGIN}/v1`;

export type Purpose = "plan" | "extract" | "verify" | "explain";

export interface ModelPrice {
  /** USD per 1M input tokens, from Vultr's current price sheet. */
  inputPerMTokUsd: number;
  /** USD per 1M output tokens. */
  outputPerMTokUsd: number;
}

export interface InferenceConfig {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  /** Model that accepts image input. May equal textModel. Null until the vision gate passes. */
  visionModel: string | null;
  /** Upper bound on output tokens per call, by purpose. */
  maxOutputTokens: Record<Purpose, number>;
  timeoutMs: number;
  /** Retries after the first attempt for transient failures (PRD §15: at most twice). */
  maxRetries: number;
  /** Send response_format: {type: "json_object"}. Only true once the smoke test proves the account supports it. */
  jsonMode: boolean;
  prices: Record<string, ModelPrice>;
}

export class InferenceConfigError extends Error {
  override name = "InferenceConfigError";
}

/** Throws unless the URL is on the Vultr inference origin over HTTPS. */
export function assertVultrInferenceUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InferenceConfigError(`Inference URL is not a valid URL`);
  }
  if (parsed.origin !== VULTR_INFERENCE_ORIGIN) {
    throw new InferenceConfigError(
      `Refusing inference call to ${parsed.origin}. Only ${VULTR_INFERENCE_ORIGIN} is allowed.`,
    );
  }
}

/** Output caps include reasoning tokens on thinking models, so they are larger than the visible answer needs. */
const DEFAULT_CAPS: Record<Purpose, number> = { plan: 3000, extract: 3000, verify: 1500, explain: 3000 };

/** Model IDs and prices pinned after the capability gate. Edit pinned-models.json, not code. */
export interface PinnedModels {
  textModel: string | null;
  visionModel: string | null;
  jsonMode: boolean;
  prices: Record<string, ModelPrice>;
  testedAt: string | null;
}

export function loadInferenceConfig(
  env: Record<string, string | undefined> = process.env,
  pinned: Partial<PinnedModels> = {},
): InferenceConfig {
  const apiKey = env.VULTR_INFERENCE_API_KEY?.trim();
  if (!apiKey) {
    throw new InferenceConfigError("VULTR_INFERENCE_API_KEY is not set. Add it to .env (see .env.example).");
  }
  const baseUrl = (env.VULTR_INFERENCE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  assertVultrInferenceUrl(baseUrl);

  const textModel = env.INFERENCE_MODEL_TEXT?.trim() || pinned.textModel || "";
  if (!textModel) {
    throw new InferenceConfigError(
      "No text model pinned. Run `npm run smoke:inference -w @wallio/api` and set INFERENCE_MODEL_TEXT.",
    );
  }
  const visionModel = env.INFERENCE_MODEL_VISION?.trim() || pinned.visionModel || null;

  return {
    apiKey,
    baseUrl,
    textModel,
    visionModel,
    maxOutputTokens: { ...DEFAULT_CAPS },
    timeoutMs: Number(env.INFERENCE_TIMEOUT_MS) || 30_000,
    maxRetries: 2,
    jsonMode: pinned.jsonMode ?? false,
    prices: pinned.prices ?? {},
  };
}
