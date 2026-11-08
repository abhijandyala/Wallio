/** Stores one evidence item (and its screenshot, if any) for the current run. */
import type { RunContext } from "./worker.ts";
import { sha256, type Shot } from "./browser-session.ts";

export interface EvidenceInput {
  kind: "vendor_claim" | "observed_behavior" | "executed_test" | "user_input";
  accessMode: "researched" | "tested_integration" | "tested_owned_demo" | null;
  toolId: string | null;
  url: string;
  text: string;
  textHash?: string | null;
  capturedAt?: string;
  excerpt: string;
  limitation: string;
  shot: Shot | null;
  method?: "dom" | "manual";
  /** If set, an evidence_captured event with this message is emitted. */
  message?: string;
}

export async function storeEvidence(ctx: RunContext, e: EvidenceInput): Promise<string> {
  return ctx.q(async (q) => {
    const id = (await q<{ id: string }>(
      `INSERT INTO evidence (tenant_id, run_id, kind, candidate_tool_id, access_mode, url, canonical_url, captured_at, content_hash, screenshot_key, extraction_method, excerpt, limitation)
       VALUES ($1,$2,$3,$4,$5,$6,$6,COALESCE($7::timestamptz, now()),$8,$9,$10,$11,$12) RETURNING id`,
      [ctx.tenantId, ctx.runId, e.kind, e.toolId, e.accessMode, e.url, e.capturedAt ?? null, e.textHash ?? sha256(e.text), e.shot ? "db" : null,
       e.method ?? "dom", e.excerpt.slice(0, 2000), e.limitation],
    )).rows[0]!.id;
    if (e.shot) await q("INSERT INTO evidence_screenshots (evidence_id, tenant_id, sha256, mime, bytes) VALUES ($1,$2,$3,'image/png',$4)", [id, ctx.tenantId, e.shot.hash, e.shot.bytes]);
    await q("UPDATE runs SET evidence_count = evidence_count + 1 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]);
    return id;
  }).then(async (id) => {
    if (e.message) await ctx.emit({ type: "evidence_captured", message: e.message, data: { evidenceId: id, kind: e.kind, url: e.url, candidateToolId: e.toolId } });
    return id;
  });
}
