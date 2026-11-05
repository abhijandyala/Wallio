/**
 * The only code path allowed to call an LLM.
 *
 * - Locked to Vultr Serverless Inference; any other URL throws before fetch.
 * - Model allowlist: only the pinned text and vision models.
 * - Output token caps per purpose.
 * - Transient failures (network, timeout, 429, 5xx) retried at most twice with backoff.
 * - Structured output validated with zod; one repair attempt, then a clear error.
 * - Usage (tokens, latency, cost estimate) reported for every call. Prompt and
 *   response contents are never logged.
 * - No fallback provider. If Vultr is down, callers get `inference_unavailable`
 *   and produce a partial result.
 */
import type { ZodType } from "zod";
import { assertVultrInferenceUrl, type InferenceConfig, type Purpose } from "./config.ts";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface UsageRecord {
  correlationId: string;
  purpose: Purpose;
  model: string;
  ok: boolean;
  errorCode: InferenceErrorCode | null;
  attempts: number;
  repairAttempted: boolean;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Estimated cost in micro-USD (1e-6 USD). Null when the model's price isn't pinned or usage wasn't reported. */
  estimatedCostMicroUsd: number | null;
  at: string;
}

export type InferenceErrorCode = "inference_unavailable" | "inference_invalid_output" | "inference_rejected";

export class InferenceError extends Error {
  override name = "InferenceError";
  readonly code: InferenceErrorCode;
  readonly retryable: boolean;
  readonly status: number | null;
  /** Raw model text when output failed validation, for a partial result. Never shown verbatim to users. */
  readonly rawOutput: string | null;
  constructor(code: InferenceErrorCode, message: string, opts: { retryable?: boolean; status?: number | null; rawOutput?: string | null } = {}) {
    super(message);
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status ?? null;
    this.rawOutput = opts.rawOutput ?? null;
  }
}

export interface ChatRequest {
  purpose: Purpose;
  messages: ChatMessage[];
  correlationId: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface GatewayDeps {
  fetch?: typeof fetch;
  onUsage?: (record: UsageRecord) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class InferenceGateway {
  private readonly cfg: InferenceConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly onUsage: GatewayDeps["onUsage"];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(cfg: InferenceConfig, deps: GatewayDeps = {}) {
    assertVultrInferenceUrl(cfg.baseUrl);
    this.cfg = cfg;
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
    this.onUsage = deps.onUsage;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? Date.now;
  }

  /** Lists models the account can use. */
  async listModels(): Promise<unknown> {
    const res = await this.send("GET", "/models", undefined);
    return res.json();
  }

  /** Plain text completion. */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = this.now();
    const model = this.pickModel(req);
    let attempts = 0;
    try {
      const out = await this.complete(req, model, false, (n) => (attempts = n));
      this.report(req, model, started, attempts, false, out, null);
      return out;
    } catch (err) {
      this.report(req, model, started, attempts, false, null, toCode(err));
      throw err;
    }
  }

  /**
   * Completion that must match `schema`. Malformed or invalid JSON gets exactly
   * one repair attempt (PRD §10), then throws `inference_invalid_output`.
   */
  async chatJSON<T>(req: ChatRequest & { schema: ZodType<T> }): Promise<ChatResult & { data: T }> {
    const started = this.now();
    const model = this.pickModel(req);
    let attempts = 0;
    let totalPrompt: number | null = 0;
    let totalCompletion: number | null = 0;
    const add = (r: ChatResult) => {
      totalPrompt = totalPrompt === null || r.promptTokens === null ? null : totalPrompt + r.promptTokens;
      totalCompletion = totalCompletion === null || r.completionTokens === null ? null : totalCompletion + r.completionTokens;
    };
    const track = (n: number) => (attempts += n);
    let repairAttempted = false;

    try {
      const first = await this.complete(req, model, this.cfg.jsonMode, track);
      add(first);
      const parsed = parseAgainst(first.text, req.schema);
      if (parsed.ok) {
        const out = { ...first, promptTokens: totalPrompt, completionTokens: totalCompletion, data: parsed.data };
        this.report(req, model, started, attempts, false, out, null);
        return out;
      }

      repairAttempted = true;
      const repairReq: ChatRequest = {
        ...req,
        messages: [
          ...req.messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content:
              `Your previous reply was not valid. Problems: ${parsed.problem}\n` +
              "Reply again with ONLY the corrected JSON object. No prose, no code fences.",
          },
        ],
      };
      const second = await this.complete(repairReq, model, this.cfg.jsonMode, track);
      add(second);
      const reparsed = parseAgainst(second.text, req.schema);
      if (reparsed.ok) {
        const out = { ...second, promptTokens: totalPrompt, completionTokens: totalCompletion, data: reparsed.data };
        this.report(req, model, started, attempts, true, out, null);
        return out;
      }
      throw new InferenceError("inference_invalid_output", `Model output failed validation after one repair: ${reparsed.problem}`, {
        rawOutput: second.text,
      });
    } catch (err) {
      this.report(req, model, started, attempts, repairAttempted, { promptTokens: totalPrompt, completionTokens: totalCompletion }, toCode(err));
      throw err;
    }
  }

  // ───────────────────────── internals ─────────────────────────

  private pickModel(req: ChatRequest): string {
    const hasImage = req.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
    if (!hasImage) return this.cfg.textModel;
    if (!this.cfg.visionModel) {
      throw new InferenceError("inference_rejected", "Image input requested but no vision model has passed the capability gate.");
    }
    return this.cfg.visionModel;
  }

  /** One logical completion, with transient-failure retries. */
  private async complete(req: ChatRequest, model: string, jsonMode: boolean, onAttempts: (n: number) => void): Promise<ChatResult> {
    const cap = this.cfg.maxOutputTokens[req.purpose];
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      max_tokens: Math.min(req.maxTokens ?? cap, cap),
      temperature: req.temperature ?? 0.2,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    let lastErr: unknown;
    let attempts = 0;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      attempts++;
      try {
        const res = await this.send("POST", "/chat/completions", body);
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          model?: string;
        };
        const text = json.choices?.[0]?.message?.content;
        if (typeof text !== "string" || text.length === 0) {
          throw new InferenceError("inference_invalid_output", "Inference response had no message content.");
        }
        onAttempts(attempts);
        return {
          text,
          model: json.model ?? model,
          promptTokens: json.usage?.prompt_tokens ?? null,
          completionTokens: json.usage?.completion_tokens ?? null,
        };
      } catch (err) {
        lastErr = err;
        const retryable = err instanceof InferenceError ? err.retryable : false;
        if (!retryable || attempt === this.cfg.maxRetries) break;
        await this.sleep(250 * 2 ** attempt + Math.floor(Math.random() * 100));
      }
    }
    onAttempts(attempts);
    throw lastErr;
  }

  /** The single place a request leaves this process. */
  private async send(method: "GET" | "POST", path: string, body: unknown): Promise<Response> {
    const url = `${this.cfg.baseUrl}${path}`;
    assertVultrInferenceUrl(url);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new InferenceError("inference_unavailable", timedOut ? "Inference request timed out." : "Could not reach Vultr inference.", {
        retryable: true,
      });
    }
    if (!res.ok) {
      const detail = await safeErrorDetail(res);
      if (RETRYABLE_STATUS.has(res.status)) {
        throw new InferenceError("inference_unavailable", `Vultr inference returned ${res.status}${detail}`, { retryable: true, status: res.status });
      }
      throw new InferenceError("inference_rejected", `Vultr inference rejected the request (${res.status})${detail}`, { status: res.status });
    }
    return res;
  }

  private report(
    req: ChatRequest,
    model: string,
    started: number,
    attempts: number,
    repairAttempted: boolean,
    usage: { promptTokens: number | null; completionTokens: number | null } | null,
    errorCode: InferenceErrorCode | null,
  ): void {
    if (!this.onUsage) return;
    const price = this.cfg.prices[model];
    const p = usage?.promptTokens ?? null;
    const c = usage?.completionTokens ?? null;
    const cost = price && p !== null && c !== null ? Math.round(p * price.inputPerMTokUsd + c * price.outputPerMTokUsd) : null;
    const record: UsageRecord = {
      correlationId: req.correlationId,
      purpose: req.purpose,
      model,
      ok: errorCode === null,
      errorCode,
      attempts,
      repairAttempted,
      latencyMs: this.now() - started,
      promptTokens: p,
      completionTokens: c,
      estimatedCostMicroUsd: cost,
      at: new Date(this.now()).toISOString(),
    };
    try {
      void Promise.resolve(this.onUsage(record)).catch(() => {});
    } catch {
      /* usage reporting must never break a call */
    }
  }
}

// ───────────────────────── helpers ─────────────────────────

function toCode(err: unknown): InferenceErrorCode {
  return err instanceof InferenceError ? err.code : "inference_unavailable";
}

async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
    return text ? `: ${text}` : "";
  } catch {
    return "";
  }
}

/** Pulls a JSON value out of model text (tolerates code fences and surrounding prose) and validates it. */
export function parseAgainst<T>(text: string, schema: ZodType<T>): { ok: true; data: T } | { ok: false; problem: string } {
  const candidate = extractJson(text);
  if (candidate === null) return { ok: false, problem: "no JSON object found in the reply" };
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch (e) {
    return { ok: false, problem: `invalid JSON (${(e as Error).message})` };
  }
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const problem = r.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, problem };
}

export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  const starts = [body.indexOf("{"), body.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return end > start ? body.slice(start, end + 1) : null;
}
