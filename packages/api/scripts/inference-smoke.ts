/**
 * Vultr Serverless Inference capability gate (PRD §17, phase P1).
 *
 *   npm run smoke:inference                       # auto-pick from model metadata
 *   npm run smoke:inference -- --text glm-5.3-flash --vision qwen3.8-27b --pin
 *
 * 1. Reads the model catalog (modalities + per-token prices) for this account.
 * 2. Text:        each text candidate must return a fixed reply.
 * 3. Structured:  a research-plan JSON object must pass zod validation
 *                 (prompt-only and with JSON mode) and stay on allowed URLs.
 * 4. Vision:      an image-capable model must read back a random code drawn into a PNG.
 *
 * Writes packages/api/inference-gate-report.json (no secrets). With --pin,
 * writes the chosen models, JSON-mode support and catalog prices into
 * src/inference/pinned-models.json. The API key is read from .env and never printed.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  InferenceGateway,
  InferenceError,
  DEFAULT_BASE_URL,
  assertVultrInferenceUrl,
  type InferenceConfig,
  type ModelPrice,
} from "../src/inference/index.ts";
import { markerPng, randomMarker } from "./marker-png.ts";

const { values: args } = parseArgs({
  options: {
    text: { type: "string", multiple: true },
    vision: { type: "string", multiple: true },
    pin: { type: "boolean", default: false },
  },
});

const apiKey = process.env.VULTR_INFERENCE_API_KEY?.trim();
if (!apiKey) {
  console.error("✖ VULTR_INFERENCE_API_KEY is not set. Put it in the repo-root .env file (copy .env.example). Do not paste it in chat.");
  process.exit(1);
}
const baseUrl = (process.env.VULTR_INFERENCE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
assertVultrInferenceUrl(baseUrl);

// ── 1. catalog ──
type Modality = { type: string; pricing?: Array<{ type: string; unit: string; cost_usd: string }> };
type CatalogModel = { id: string; name?: string; description?: string; input_modalities?: Modality[]; output_modalities?: Modality[]; endpoints?: string[] };

console.log(`\nVultr inference gate → ${baseUrl}\n`);
const catRes = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
if (!catRes.ok) {
  console.error(`✖ GET /models → ${catRes.status}. Check the key is a Serverless Inference key.`);
  process.exit(1);
}
const catalog: CatalogModel[] = ((await catRes.json()) as { data?: CatalogModel[] }).data ?? [];
const types = (ms?: Modality[]) => new Set((ms ?? []).map((m) => m.type));
const isChat = (m: CatalogModel) =>
  types(m.output_modalities).has("text") && types(m.input_modalities).has("text") && !/content-safety/i.test(m.id) && !(m.endpoints ?? []).some((e) => e.includes("/audio/"));
const isVision = (m: CatalogModel) => isChat(m) && types(m.input_modalities).has("image");

/** USD per 1M tokens from the catalog's per-token cost_usd. */
function priceOf(m: CatalogModel | undefined): ModelPrice | null {
  if (!m) return null;
  const pick = (ms: Modality[] | undefined, want: RegExp) =>
    (ms ?? []).flatMap((x) => x.pricing ?? []).find((p) => p.unit === "token" && want.test(p.type));
  const inp = pick(m.input_modalities, /prompt|input/);
  const out = pick(m.output_modalities, /completion|output/);
  if (!inp || !out) return null;
  const perM = (c: string) => Math.round(Number(c) * 1e6 * 1e6) / 1e6;
  return { inputPerMTokUsd: perM(inp.cost_usd), outputPerMTokUsd: perM(out.cost_usd) };
}

const chatModels = catalog.filter(isChat).map((m) => m.id);
console.log(`Catalog: ${catalog.length} models, ${chatModels.length} chat-capable, ${catalog.filter(isVision).length} also take images`);
for (const id of chatModels) {
  const p = priceOf(catalog.find((m) => m.id === id));
  console.log(`  ${id.padEnd(40)} ${isVision(catalog.find((m) => m.id === id)!) ? "text+image" : "text      "}  ${p ? `$${p.inputPerMTokUsd.toFixed(2)} in / $${p.outputPerMTokUsd.toFixed(2)} out per 1M` : "price not listed"}`);
}

// Fast general models first: planning and extraction run many times per comparison.
const PREFERENCE = ["glm-5.3-flash", "qwen3.8-flash-next", "deepseek-v4.1-flash-1017", "minimax-m3.1-flash", "qwen3.8-27b", "glm-5.3"];
const byPreference = (ids: string[]) => [...ids].sort((a, b) => (PREFERENCE.indexOf(a) + 1 || 99) - (PREFERENCE.indexOf(b) + 1 || 99));

const textCandidates = (args.text?.length ? args.text : byPreference(chatModels).slice(0, 3)).filter((id) => {
  if (chatModels.includes(id)) return true;
  console.log(`  skipping ${id}: not a chat model in this catalog`);
  return false;
});
if (!textCandidates.length) {
  console.error("✖ No chat-capable model to test.");
  process.exit(1);
}

const cfgFor = (textModel: string, visionModel: string | null, jsonMode = false): InferenceConfig => ({
  apiKey,
  baseUrl,
  textModel,
  visionModel,
  maxOutputTokens: { plan: 3000, extract: 3000, verify: 1500, explain: 3000, task: 2000 },
  timeoutMs: 90_000,
  maxRetries: 2,
  jsonMode,
  prices: {},
});

type Check = { name: string; model: string; pass: boolean; latencyMs: number; detail: string };
const checks: Check[] = [];
const ms = (t: number) => Math.round(performance.now() - t);
const short = (e: unknown) => (e instanceof InferenceError ? `${e.code}: ${e.message}` : String(e)).slice(0, 200);

// ── 2 & 3. text + structured, per candidate ──
const ResearchPlan = z.object({
  goal: z.string().min(5),
  steps: z
    .array(z.object({ action: z.enum(["navigate", "inspect", "screenshot", "finish"]), url: z.url().optional(), reason: z.string().min(3) }))
    .min(2)
    .max(8),
  claimsToCheck: z.array(z.string()).min(1),
});
const planPrompt = [
  {
    role: "system" as const,
    content:
      "You plan bounded browser research. Reply with ONLY a JSON object, no prose, matching: " +
      '{"goal": string, "steps": [{"action": "navigate"|"inspect"|"screenshot"|"finish", "url"?: string, "reason": string}], "claimsToCheck": string[]}. ' +
      "Use only these URLs: https://github.com/features/copilot/plans and https://zed.dev/pricing. At most 8 steps. End with a finish step.",
  },
  { role: "user" as const, content: "Plan research to compare the individual paid plans of GitHub Copilot and Zed for a solo web developer." },
];

const textResults: Record<string, { text: boolean; structured: boolean; jsonMode: boolean; latencyMs: number }> = {};
for (const model of textCandidates) {
  const r = { text: false, structured: false, jsonMode: false, latencyMs: 0 };
  {
    const t = performance.now();
    try {
      const out = await new InferenceGateway(cfgFor(model, null)).chat({
        purpose: "plan",
        correlationId: "gate-text",
        messages: [{ role: "user", content: "Reply with exactly this and nothing else: WALLIO-OK" }],
      });
      r.text = out.text.trim().replace(/[.`"']/g, "") === "WALLIO-OK";
      r.latencyMs = ms(t);
      checks.push({ name: "text", model, pass: r.text, latencyMs: r.latencyMs, detail: `tokens ${out.promptTokens}/${out.completionTokens}; reply "${out.text.trim().slice(0, 30)}"` });
    } catch (e) {
      checks.push({ name: "text", model, pass: false, latencyMs: ms(t), detail: short(e) });
    }
  }
  for (const jsonMode of [false, true]) {
    const t = performance.now();
    const name = jsonMode ? "structured (json mode)" : "structured (prompt only)";
    try {
      const out = await new InferenceGateway(cfgFor(model, null, jsonMode)).chatJSON({ purpose: "plan", correlationId: "gate-json", messages: planPrompt, schema: ResearchPlan });
      const urlsOk = out.data.steps.every((s) => !s.url || /^https:\/\/(github\.com\/features\/copilot|zed\.dev\/pricing)/.test(s.url));
      checks.push({ name, model, pass: urlsOk, latencyMs: ms(t), detail: `${out.data.steps.length} steps; ${urlsOk ? "stayed on allowed URLs" : "proposed a URL outside the allowlist (policy would deny)"}` });
      if (urlsOk) jsonMode ? (r.jsonMode = true) : (r.structured = true);
    } catch (e) {
      checks.push({ name, model, pass: false, latencyMs: ms(t), detail: short(e) });
    }
  }
  textResults[model] = r;
}
const textModel = textCandidates.find((m) => textResults[m]!.text && (textResults[m]!.structured || textResults[m]!.jsonMode)) ?? null;

// ── 4. vision ──
const visionCatalog = catalog.filter(isVision).map((m) => m.id);
const visionCandidates = (
  args.vision?.length ? args.vision : [...(textModel && visionCatalog.includes(textModel) ? [textModel] : []), ...byPreference(visionCatalog)].slice(0, 4)
).filter((m, i, a) => a.indexOf(m) === i);

let visionModel: string | null = null;
for (const model of visionCandidates) {
  const code = randomMarker(4);
  const dataUrl = `data:image/png;base64,${markerPng(code).toString("base64")}`;
  const t = performance.now();
  try {
    const out = await new InferenceGateway(cfgFor(textModel ?? model, model)).chat({
      purpose: "verify",
      correlationId: "gate-vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "The image shows a short code in large black letters. Reply with only those characters, nothing else." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const seen = out.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pass = seen === code;
    checks.push({ name: "vision", model, pass, latencyMs: ms(t), detail: `expected ${code}, got "${out.text.trim().slice(0, 30)}"` });
    if (pass) { visionModel = model; break; }
  } catch (e) {
    checks.push({ name: "vision", model, pass: false, latencyMs: ms(t), detail: short(e) });
  }
}

// ── report ──
console.log("\nResult  Check                      Model                                   ms     Detail");
for (const c of checks) {
  console.log(`${c.pass ? "PASS  " : "FAIL  "}  ${c.name.padEnd(25)}  ${c.model.slice(0, 38).padEnd(38)}  ${String(c.latencyMs).padStart(6)}  ${c.detail}`);
}
const jsonMode = textModel ? textResults[textModel]!.jsonMode : false;
const gatePassed = textModel !== null && visionModel !== null;
console.log(`\nChosen text model: ${textModel ?? "none passed"}  (JSON mode ${jsonMode ? "works" : "not used"})`);
console.log(`Chosen vision model: ${visionModel ?? "none passed"}`);
console.log(`Gate → ${gatePassed ? "PASSED" : "NOT PASSED"}`);
if (!visionModel) console.log("Vision failed for every candidate. Tell the team today: do not claim screenshot verification until this passes.");

const prices: Record<string, ModelPrice> = {};
for (const id of [textModel, visionModel]) {
  const p = id ? priceOf(catalog.find((m) => m.id === id)) : null;
  if (id && p) prices[id] = p;
}

const report = {
  testedAt: new Date().toISOString(),
  baseUrl,
  chatModelsAvailable: chatModels,
  textCandidates,
  visionCandidates,
  textModel,
  visionModel,
  jsonMode,
  pricesUsdPerMTok: prices,
  gatePassed,
  checks,
  note: "Prices come from the /v1/models catalog at test time. Rate limits are not exposed by the API; confirm them in the Vultr console.",
};
writeFileSync(new URL("../inference-gate-report.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log("Wrote packages/api/inference-gate-report.json");

if (args.pin) {
  if (!textModel) {
    console.log("Not pinning: no text model passed both text and structured checks.");
  } else {
    const file = new URL("../src/inference/pinned-models.json", import.meta.url);
    const current = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...current, textModel, visionModel, jsonMode, prices, testedAt: report.testedAt }, null, 2) + "\n");
    console.log(`Pinned text=${textModel} vision=${visionModel ?? "none"} jsonMode=${jsonMode}`);
  }
}
process.exit(gatePassed ? 0 : 2);
