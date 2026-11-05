import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  InferenceGateway,
  InferenceError,
  InferenceConfigError,
  loadInferenceConfig,
  extractJson,
  type InferenceConfig,
  type UsageRecord,
} from "../src/inference/index.ts";

const baseCfg = (over: Partial<InferenceConfig> = {}): InferenceConfig => ({
  apiKey: "test-key-not-real",
  baseUrl: "https://api.vultrinference.com/v1",
  textModel: "text-model",
  visionModel: "vision-model",
  maxOutputTokens: { plan: 100, extract: 100, verify: 50, explain: 100 },
  timeoutMs: 1000,
  maxRetries: 2,
  jsonMode: false,
  prices: { "text-model": { inputPerMTokUsd: 1, outputPerMTokUsd: 4 } },
  ...over,
});

type Reply = { status?: number; content?: string | null; throws?: Error; usage?: { prompt_tokens: number; completion_tokens: number } };

function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (r.throws) throw r.throws;
    const status = r.status ?? 200;
    const payload = status === 200
      ? { model: "text-model", choices: [{ message: { content: r.content ?? "" } }], usage: r.usage ?? { prompt_tokens: 10, completion_tokens: 5 } }
      : { error: "nope" };
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const gw = (replies: Reply[], over: Partial<InferenceConfig> = {}) => {
  const f = fakeFetch(replies);
  const usage: UsageRecord[] = [];
  const g = new InferenceGateway(baseCfg(over), { fetch: f.fn, onUsage: (u) => void usage.push(u), sleep: async () => {} });
  return { g, calls: f.calls, usage };
};

const msg = [{ role: "user" as const, content: "hi" }];

// ── endpoint lock ──

test("refuses a non-Vultr base URL at construction", () => {
  assert.throws(() => new InferenceGateway(baseCfg({ baseUrl: "https://api.openai.com/v1" })), InferenceConfigError);
  assert.throws(() => new InferenceGateway(baseCfg({ baseUrl: "http://api.vultrinference.com/v1" })), InferenceConfigError);
  assert.throws(() => new InferenceGateway(baseCfg({ baseUrl: "https://api.vultrinference.com.evil.example/v1" })), InferenceConfigError);
});

test("config loader refuses other hosts and requires a key and model", () => {
  assert.throws(() => loadInferenceConfig({}), /VULTR_INFERENCE_API_KEY/);
  assert.throws(() => loadInferenceConfig({ VULTR_INFERENCE_API_KEY: "k" }), /No text model/);
  assert.throws(
    () => loadInferenceConfig({ VULTR_INFERENCE_API_KEY: "k", INFERENCE_MODEL_TEXT: "m", VULTR_INFERENCE_BASE_URL: "https://example.com/v1" }),
    InferenceConfigError,
  );
  const cfg = loadInferenceConfig({ VULTR_INFERENCE_API_KEY: "k", INFERENCE_MODEL_TEXT: "m" });
  assert.equal(cfg.baseUrl, "https://api.vultrinference.com/v1");
});

test("sends bearer auth to the Vultr chat completions path with capped tokens", async () => {
  const { g, calls } = gw([{ content: "hello" }]);
  const out = await g.chat({ purpose: "verify", messages: msg, correlationId: "c1", maxTokens: 9999 });
  assert.equal(out.text, "hello");
  assert.equal(calls[0]!.url, "https://api.vultrinference.com/v1/chat/completions");
  assert.equal(calls[0]!.headers.Authorization, "Bearer test-key-not-real");
  assert.equal(calls[0]!.body.max_tokens, 50, "verify cap applies");
  assert.equal(calls[0]!.body.model, "text-model");
});

// ── retries ──

test("retries 503 then succeeds; at most 2 retries", async () => {
  const ok = gw([{ status: 503 }, { status: 503 }, { content: "done" }]);
  assert.equal((await ok.g.chat({ purpose: "plan", messages: msg, correlationId: "c" })).text, "done");
  assert.equal(ok.calls.length, 3);

  const fail = gw([{ status: 503 }]);
  await assert.rejects(fail.g.chat({ purpose: "plan", messages: msg, correlationId: "c" }), (e: InferenceError) => e.code === "inference_unavailable");
  assert.equal(fail.calls.length, 3, "1 attempt + 2 retries, never more");
  assert.equal(fail.usage[0]!.ok, false);
  assert.equal(fail.usage[0]!.attempts, 3);
});

test("network errors are retried; 400 is not", async () => {
  const net = gw([{ throws: new TypeError("fetch failed") }, { content: "ok" }]);
  assert.equal((await net.g.chat({ purpose: "plan", messages: msg, correlationId: "c" })).text, "ok");

  const bad = gw([{ status: 400 }]);
  await assert.rejects(bad.g.chat({ purpose: "plan", messages: msg, correlationId: "c" }), (e: InferenceError) => e.code === "inference_rejected");
  assert.equal(bad.calls.length, 1);
});

// ── structured output ──

const Plan = z.object({ steps: z.array(z.object({ action: z.enum(["navigate", "finish"]), url: z.string().optional() })).min(1) });

test("chatJSON accepts fenced JSON", async () => {
  const { g } = gw([{ content: "Here you go:\n```json\n{\"steps\":[{\"action\":\"finish\"}]}\n```" }]);
  const out = await g.chatJSON({ purpose: "plan", messages: msg, correlationId: "c", schema: Plan });
  assert.deepEqual(out.data, { steps: [{ action: "finish" }] });
});

test("chatJSON makes exactly one repair attempt and tells the model what was wrong", async () => {
  const { g, calls, usage } = gw([{ content: '{"steps":[{"action":"shell"}]}' }, { content: '{"steps":[{"action":"finish"}]}' }]);
  const out = await g.chatJSON({ purpose: "plan", messages: msg, correlationId: "c", schema: Plan });
  assert.equal(out.data.steps[0]!.action, "finish");
  assert.equal(calls.length, 2);
  const repairMsg = calls[1]!.body.messages.at(-1).content as string;
  assert.match(repairMsg, /steps\.0\.action/);
  assert.equal(usage[0]!.repairAttempted, true);
  assert.equal(usage[0]!.promptTokens, 20, "tokens summed across both calls");
});

test("chatJSON gives up after one failed repair with inference_invalid_output", async () => {
  const { g, calls } = gw([{ content: "not json" }, { content: "still not json" }]);
  await assert.rejects(
    g.chatJSON({ purpose: "plan", messages: msg, correlationId: "c", schema: Plan }),
    (e: InferenceError) => e.code === "inference_invalid_output" && e.rawOutput === "still not json",
  );
  assert.equal(calls.length, 2);
});

test("jsonMode adds response_format only when enabled", async () => {
  const off = gw([{ content: '{"steps":[{"action":"finish"}]}' }]);
  await off.g.chatJSON({ purpose: "plan", messages: msg, correlationId: "c", schema: Plan });
  assert.equal(off.calls[0]!.body.response_format, undefined);

  const on = gw([{ content: '{"steps":[{"action":"finish"}]}' }], { jsonMode: true });
  await on.g.chatJSON({ purpose: "plan", messages: msg, correlationId: "c", schema: Plan });
  assert.deepEqual(on.calls[0]!.body.response_format, { type: "json_object" });
});

// ── models & usage ──

test("image input routes to the vision model, and fails clearly when none is pinned", async () => {
  const img = [{ role: "user" as const, content: [{ type: "text" as const, text: "what?" }, { type: "image_url" as const, image_url: { url: "data:image/png;base64,AAAA" } }] }];
  const { g, calls } = gw([{ content: "red" }]);
  await g.chat({ purpose: "verify", messages: img, correlationId: "c" });
  assert.equal(calls[0]!.body.model, "vision-model");

  const none = gw([{ content: "x" }], { visionModel: null });
  await assert.rejects(none.g.chat({ purpose: "verify", messages: img, correlationId: "c" }), (e: InferenceError) => e.code === "inference_rejected");
  assert.equal(none.calls.length, 0, "never calls without a gated vision model");
});

test("usage record has tokens and cost but no prompt or response content", async () => {
  const { g, usage } = gw([{ content: "secret answer", usage: { prompt_tokens: 1000, completion_tokens: 500 } }]);
  await g.chat({ purpose: "explain", messages: [{ role: "user", content: "secret prompt" }], correlationId: "corr-7" });
  const u = usage[0]!;
  assert.equal(u.correlationId, "corr-7");
  assert.equal(u.estimatedCostMicroUsd, 1000 * 1 + 500 * 4);
  assert.ok(!JSON.stringify(u).includes("secret"));
});

test("a throwing usage sink never breaks the call", async () => {
  const f = fakeFetch([{ content: "fine" }]);
  const g = new InferenceGateway(baseCfg(), { fetch: f.fn, onUsage: () => { throw new Error("db down"); } });
  assert.equal((await g.chat({ purpose: "plan", messages: msg, correlationId: "c" })).text, "fine");
});

test("pinned per-model params are sent, but can't override model or messages", async () => {
  const { g, calls } = gw([{ content: "ok" }], { modelParams: { "text-model": { chat_template_kwargs: { enable_thinking: false }, model: "evil-model", messages: [] } } });
  await g.chat({ purpose: "plan", messages: msg, correlationId: "c" });
  assert.deepEqual(calls[0]!.body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(calls[0]!.body.model, "text-model");
  assert.equal(calls[0]!.body.messages.length, 1);
});

test("extractJson handles prose, fences and arrays", () => {
  assert.equal(extractJson('sure: {"a":1} thanks'), '{"a":1}');
  assert.equal(extractJson("```\n[1,2]\n```"), "[1,2]");
  assert.equal(extractJson("no json here"), null);
});
