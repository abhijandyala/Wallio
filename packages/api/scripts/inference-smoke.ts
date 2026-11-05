/**
 * Vultr Serverless Inference capability gate (PRD §17, phase P1).
 *
 *   npm run smoke:inference -w @wallio/api
 *   npm run smoke:inference -w @wallio/api -- --text <model> --vision <model> [--vision <model2>] [--pin]
 *
 * 1. Lists the models this account can use.
 * 2. Text:        a plain reply comes back.
 * 3. Structured:  a research-plan JSON object passes zod validation (with and without JSON mode).
 * 4. Vision:      the model reads back a random code drawn into a PNG.
 *
 * Writes packages/api/inference-gate-report.json (no secrets). With --pin, also
 * writes the passing models into src/inference/pinned-models.json.
 * The API key is read from .env and never printed.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { InferenceGateway, InferenceError, type InferenceConfig, DEFAULT_BASE_URL, assertVultrInferenceUrl } from "../src/inference/index.ts";
import { markerPng, randomMarker } from "./marker-png.ts";

const { values: args } = parseArgs({
  options: {
    text: { type: "string" },
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

const cfgFor = (textModel: string, visionModel: string | null, jsonMode = false): InferenceConfig => ({
  apiKey,
  baseUrl,
  textModel,
  visionModel,
  maxOutputTokens: { plan: 800, extract: 800, verify: 60, explain: 800 },
  timeoutMs: 60_000,
  maxRetries: 2,
  jsonMode,
  prices: {},
});

type Check = { name: string; model: string; pass: boolean; latencyMs: number; detail: string };
const checks: Check[] = [];
const ms = (t: number) => Math.round(performance.now() - t);
const short = (e: unknown) => (e instanceof InferenceError ? `${e.code}: ${e.message}` : String(e)).slice(0, 220);

// ── 1. models ──
console.log(`\nVultr inference gate → ${baseUrl}\n`);
let modelIds: string[] = [];
let modelsRaw: unknown = null;
for (const path of ["/models", "/chat/models"]) {
  try {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { console.log(`  GET ${path} → ${res.status}`); continue; }
    modelsRaw = await res.json();
    const list = Array.isArray(modelsRaw) ? modelsRaw : ((modelsRaw as any)?.data ?? (modelsRaw as any)?.models ?? []);
    modelIds = list.map((m: any) => (typeof m === "string" ? m : m.id ?? m.name)).filter(Boolean);
    console.log(`  GET ${path} → ${res.status}, ${modelIds.length} models`);
    if (modelIds.length) break;
  } catch (e) {
    console.log(`  GET ${path} failed: ${short(e)}`);
  }
}
if (modelIds.length) console.log("  " + modelIds.join("\n  "));

const nonChat = /embed|whisper|tts|speech|audio|rerank|stable-diffusion|flux|sdxl|image-gen/i;
const textModel = args.text ?? process.env.INFERENCE_MODEL_TEXT?.trim() ?? modelIds.find((m) => !nonChat.test(m));
if (!textModel) {
  console.error("\n✖ No text model to test. Pass --text <model id> from the list above.");
  process.exit(1);
}
const visionCandidates = [
  ...(args.vision ?? []),
  ...(process.env.INFERENCE_MODEL_VISION ? [process.env.INFERENCE_MODEL_VISION] : []),
  ...modelIds.filter((m) => /vision|vl\b|-vl|llava|pixtral|gemma-3|llama-4|qwen2\.5-vl|multimodal|omni/i.test(m)),
  textModel,
].filter((m, i, a) => m && a.indexOf(m) === i);

console.log(`\nText model: ${textModel}`);
console.log(`Vision candidates: ${visionCandidates.join(", ")}\n`);

// ── 2. text ──
{
  const gw = new InferenceGateway(cfgFor(textModel, null));
  const t = performance.now();
  try {
    const out = await gw.chat({ purpose: "plan", correlationId: "gate-text", messages: [{ role: "user", content: "Reply with exactly this and nothing else: WALLIO-OK" }] });
    const pass = out.text.includes("WALLIO-OK");
    checks.push({ name: "text", model: textModel, pass, latencyMs: ms(t), detail: `tokens in/out ${out.promptTokens}/${out.completionTokens}; reply starts "${out.text.slice(0, 40).replace(/\s+/g, " ")}"` });
  } catch (e) {
    checks.push({ name: "text", model: textModel, pass: false, latencyMs: ms(t), detail: short(e) });
  }
}

// ── 3. structured ──
const ResearchPlan = z.object({
  goal: z.string().min(5),
  steps: z
    .array(
      z.object({
        action: z.enum(["navigate", "inspect", "screenshot", "finish"]),
        url: z.url().optional(),
        reason: z.string().min(3),
      }),
    )
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
      "Use only these URLs: https://github.com/features/copilot/plans and https://zed.dev/pricing. End with a finish step.",
  },
  { role: "user" as const, content: "Plan research to compare the individual paid plans of GitHub Copilot and Zed for a solo web developer." },
];
let jsonModeWorks = false;
for (const jsonMode of [false, true]) {
  const gw = new InferenceGateway(cfgFor(textModel, null, jsonMode));
  const t = performance.now();
  const name = jsonMode ? "structured (json mode)" : "structured (prompt only)";
  try {
    const out = await gw.chatJSON({ purpose: "plan", correlationId: "gate-json", messages: planPrompt, schema: ResearchPlan });
    const urlsOk = out.data.steps.every((s) => !s.url || /^https:\/\/(github\.com\/features\/copilot|zed\.dev\/pricing)/.test(s.url));
    checks.push({ name, model: textModel, pass: urlsOk, latencyMs: ms(t), detail: `${out.data.steps.length} steps; ${urlsOk ? "stayed on allowed URLs" : "proposed a URL outside the allowlist (policy would deny)"}` });
    if (jsonMode) jsonModeWorks = true;
  } catch (e) {
    checks.push({ name, model: textModel, pass: false, latencyMs: ms(t), detail: short(e) });
  }
}

// ── 4. vision ──
let visionModel: string | null = null;
for (const model of visionCandidates) {
  const code = randomMarker(4);
  const dataUrl = `data:image/png;base64,${markerPng(code).toString("base64")}`;
  const gw = new InferenceGateway(cfgFor(textModel, model));
  const t = performance.now();
  try {
    const out = await gw.chat({
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
console.log("Result  Check                      Model                                   ms     Detail");
for (const c of checks) {
  console.log(`${c.pass ? "PASS  " : "FAIL  "}  ${c.name.padEnd(25)}  ${c.model.slice(0, 38).padEnd(38)}  ${String(c.latencyMs).padStart(6)}  ${c.detail}`);
}
const textPass = checks.some((c) => c.name === "text" && c.pass);
const jsonPass = checks.some((c) => c.name.startsWith("structured") && c.pass);
const gatePassed = textPass && jsonPass && visionModel !== null;
console.log(`\nGate: text ${textPass ? "✔" : "✖"}  structured ${jsonPass ? "✔" : "✖"}  vision ${visionModel ? "✔" : "✖"}  → ${gatePassed ? "PASSED" : "NOT PASSED"}`);
if (!visionModel) console.log("Vision failed for every candidate. Tell the team today: do not claim screenshot verification until this passes.");

const report = {
  testedAt: new Date().toISOString(),
  baseUrl,
  modelsAvailable: modelIds,
  textModel,
  visionModel,
  jsonMode: jsonModeWorks,
  gatePassed,
  checks,
  note: "Prices and rate limits are not returned by the API. Copy them from the Vultr console price sheet into pinned-models.json.",
};
writeFileSync(new URL("../inference-gate-report.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log("Wrote packages/api/inference-gate-report.json");

if (args.pin) {
  if (!textPass || !jsonPass) {
    console.log("Not pinning: text and structured checks must pass first.");
  } else {
    const file = new URL("../src/inference/pinned-models.json", import.meta.url);
    const current = JSON.parse(readFileSync(file, "utf8"));
    const pinned = { ...current, textModel, visionModel, jsonMode: jsonModeWorks, testedAt: report.testedAt };
    writeFileSync(file, JSON.stringify(pinned, null, 2) + "\n");
    console.log(`Pinned text=${textModel} vision=${visionModel ?? "none"} jsonMode=${jsonModeWorks}`);
  }
}
process.exit(gatePassed ? 0 : 2);
