/**
 * Wallio HTTP API (UI ↔ API contract, docs/CONTRACTS.md §A).
 *
 * Every response body is checked against the shared contract before it is
 * sent, so drift shows up as a clear 500 in development instead of a broken UI.
 * Every error is an ApiError with a correlation ID.
 */
import { createHash, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { z, type ZodType } from "zod";
import { api } from "@wallio/contracts";
import type { AppConfig } from "../config.ts";
import type { Db, Query } from "../db/pool.ts";
import { summarizeSpending, type SubscriptionForSpend } from "../domain/spending.ts";
import { HttpError, notFound } from "./errors.ts";
import { createGuestSession, findSession, SESSION_COOKIE } from "./session.ts";
import { transition, TERMINAL, FINISHED } from "../runs/state.ts";
import { evidenceToContract } from "../runs/executors.ts";
import type { Orchestrator } from "../runs/worker.ts";
import { renderEvalPage, tokenHash } from "../eval/harness.ts";

type Env = { Variables: { tenantId: string; correlationId: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export interface AppDeps {
  config: AppConfig;
  db: Db;
  /** The run orchestrator (worker): queueing, cancellation cleanup, capacity and spend checks. */
  runs: Orchestrator;
}

export function createApp({ config, db, runs }: AppDeps) {
  const app = new Hono<Env>();

  // ── correlation id + access log (metadata only, never bodies) ──
  app.use("*", async (c, next) => {
    const incoming = c.req.header("x-correlation-id");
    const id = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : `corr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    c.set("correlationId", id);
    c.header("x-correlation-id", id);
    const t = performance.now();
    await next();
    if (process.env.NODE_ENV !== "test") {
      console.log(JSON.stringify({ level: "info", correlationId: id, method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - t) }));
    }
  });

  app.onError((err, c) => {
    const correlationId = c.get("correlationId") ?? "unknown";
    if (err instanceof HttpError) return c.json(err.toBody(correlationId), err.status as any);
    console.error(JSON.stringify({ level: "error", correlationId, path: c.req.path, error: err.message }));
    return c.json(new HttpError("internal", "Something went wrong on our side. Try again; if it keeps happening, share the correlation ID.").toBody(correlationId), 500);
  });

  app.notFound((c) => c.json(notFound("That endpoint").toBody(c.get("correlationId") ?? "unknown"), 404));

  app.get("/api/health", (c) => c.json({ ok: true, runMode: config.runMode }));

  // Owned evaluation page, opened by the runner's isolated browser (no session). The random
  // token in the URL is the only credential; it expires in minutes and only its hash is stored.
  app.get("/eval/:token", async (c) => {
    const token = c.req.param("token");
    // Served only on the eval subdomain (Caddy enforces this too).
    if (config.evalOrigin && c.req.header("host") !== new URL(config.evalOrigin).host) throw notFound("Evaluation");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound("Evaluation");
    const row = (await db.pool.query("SELECT * FROM wallio_eval_page($1)", [tokenHash(token)])).rows[0];
    if (!row) throw notFound("Evaluation");
    const { html, csp } = renderEvalPage({ title: row.title, description: row.description, entrypoint: row.entrypoint, tests: row.tests, code: row.candidate_code });
    return c.html(html, 200, { "content-security-policy": csp, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" });
  });

  // ── CSRF: mutations must be JSON, and same-origin when an Origin header is sent ──
  app.use("/api/*", async (c, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      const ct = c.req.header("content-type") ?? "";
      if (!ct.toLowerCase().startsWith("application/json")) {
        throw new HttpError("validation_failed", "Send requests with Content-Type: application/json.");
      }
      const origin = c.req.header("origin");
      if (config.appOrigin && origin && origin !== config.appOrigin) {
        throw new HttpError("forbidden", "Cross-origin requests are not allowed.");
      }
    }
    await next();
  });

  // ── guest session: every visitor gets their own workspace ──
  app.use("/api/*", async (c, next) => {
    let tenantId = await findSession(db, getCookie(c, SESSION_COOKIE));
    if (!tenantId) {
      const s = await createGuestSession(db, config.sessionTtlHours);
      tenantId = s.workspaceId;
      setCookie(c, SESSION_COOKIE, s.token, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: "Lax",
        path: "/",
        maxAge: config.sessionTtlHours * 3600,
      });
    }
    c.set("tenantId", tenantId);
    await next();
  });

  /** Validate outgoing payloads against the contract. */
  function send<T>(c: Context<Env>, schema: ZodType<T>, data: unknown, status: 200 | 201 | 202 = 200) {
    const r = schema.safeParse(data);
    if (!r.success) {
      throw new Error(`response breaks contract: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return c.json(data as any, status);
  }

  async function body<T>(c: Context<Env>, schema: ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError("validation_failed", "The request body is not valid JSON.");
    }
    const r = schema.safeParse(raw);
    if (!r.success) {
      throw new HttpError("validation_failed", "Some fields are missing or invalid.", {
        issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return r.data;
  }

  const tenant = <T>(c: Context<Env>, fn: (q: Query, tenantId: string) => Promise<T>) => {
    const tenantId = c.get("tenantId");
    return db.withTenant(tenantId, (q) => fn(q, tenantId));
  };

  // ───────────────────────── catalog ─────────────────────────

  async function loadTools(q: Query, ids?: string[]) {
    const tools = await q(
      `SELECT * FROM catalog_tools ${ids ? "WHERE id = ANY($1)" : ""} ORDER BY name`,
      ids ? [ids] : [],
    );
    const claims = await q("SELECT * FROM catalog_claims WHERE tool_id = ANY($1)", [tools.rows.map((t) => t.id)]);
    return tools.rows.map((t) => ({
      id: t.id,
      name: t.name,
      provider: t.provider,
      category: t.category,
      homepageUrl: t.homepage_url,
      pricingUrl: t.pricing_url,
      reviewStatus: t.review_status,
      claims: claims.rows
        .filter((cl) => cl.tool_id === t.id)
        .map((cl) => ({ id: cl.id, text: cl.text, status: cl.status, evidenceIds: cl.evidence_ids, capturedAt: iso(cl.captured_at) })),
    }));
  }

  app.get("/api/catalog", async (c) => send(c, z.array(api.CatalogTool), await tenant(c, (q) => loadTools(q))));

  // ───────────────────────── inventory ─────────────────────────

  const subToContract = (r: any) => ({
    id: r.id,
    toolId: r.tool_id,
    plan: r.plan,
    price: r.price_known ? { known: true, amountMinor: r.amount_minor, currency: r.currency } : { known: false, reason: r.unknown_reason },
    cadence: r.cadence,
    seats: r.seats,
    renewalDate: r.renewal_date,
    taxIncluded: r.tax_included,
    source: r.source,
    status: r.status,
    lastVerifiedAt: iso(r.last_verified_at),
  });

  app.get("/api/inventory", async (c) => {
    const out = await tenant(c, async (q, tenantId) => {
      const subs = (await q("SELECT * FROM subscriptions WHERE tenant_id = $1 AND status <> 'archived' ORDER BY created_at", [tenantId])).rows.map(subToContract);
      const tools = await loadTools(q, [...new Set(subs.map((s) => s.toolId))]);
      const summary = summarizeSpending(subs as SubscriptionForSpend[], { today: new Date().toISOString().slice(0, 10) });
      return { subscriptions: subs, tools, summary };
    });
    return send(c, api.InventoryResponse, out);
  });

  const priceCols = (p: z.infer<typeof api.Subscription>["price"]) =>
    p.known ? [true, p.amountMinor, p.currency, null] : [false, null, null, p.reason];

  app.post("/api/inventory", async (c) => {
    const input = await body(c, api.SubscriptionInput);
    const row = await tenant(c, async (q, tenantId) => {
      const tool = await q("SELECT 1 FROM catalog_tools WHERE id = $1", [input.toolId]);
      if (!tool.rowCount) throw new HttpError("validation_failed", "That tool isn't in the catalog.", { field: "toolId" });
      const r = await q(
        `INSERT INTO subscriptions (tenant_id, tool_id, plan, price_known, amount_minor, currency, unknown_reason, cadence, seats, renewal_date, tax_included, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'user_entered') RETURNING *`,
        [tenantId, input.toolId, input.plan, ...priceCols(input.price), input.cadence, input.seats, input.renewalDate, input.taxIncluded],
      );
      await q("INSERT INTO audit_events (tenant_id, actor, action, target, correlation_id) VALUES ($1,'user','subscription.create',$2,$3)", [tenantId, r.rows[0].id, c.get("correlationId")]);
      return r.rows[0];
    });
    return send(c, api.Subscription, subToContract(row), 201);
  });

  const SubscriptionPatch = api.SubscriptionInput.partial().extend({ status: z.enum(["active", "paused", "archived"]).optional() }).strict();

  app.patch("/api/inventory/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound("Subscription");
    const patch = await body(c, SubscriptionPatch);
    const row = await tenant(c, async (q, tenantId) => {
      const cur = (await q("SELECT * FROM subscriptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [id, tenantId])).rows[0];
      if (!cur) throw notFound("Subscription");
      const merged = { ...subToContract(cur), ...patch };
      if (patch.toolId && !(await q("SELECT 1 FROM catalog_tools WHERE id = $1", [patch.toolId])).rowCount) {
        throw new HttpError("validation_failed", "That tool isn't in the catalog.", { field: "toolId" });
      }
      const r = await q(
        `UPDATE subscriptions SET tool_id=$3, plan=$4, price_known=$5, amount_minor=$6, currency=$7, unknown_reason=$8, cadence=$9, seats=$10,
           renewal_date=$11, tax_included=$12, status=$13, updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [id, tenantId, merged.toolId, merged.plan, ...priceCols(merged.price as any), merged.cadence, merged.seats, merged.renewalDate, merged.taxIncluded, merged.status],
      );
      await q("INSERT INTO audit_events (tenant_id, actor, action, target, details, correlation_id) VALUES ($1,'user','subscription.update',$2,$3,$4)", [tenantId, id, { fields: Object.keys(patch) }, c.get("correlationId")]);
      return r.rows[0];
    });
    return send(c, api.Subscription, subToContract(row));
  });

  // ───────────────────────── profile ─────────────────────────

  const profileToContract = (r: any) => ({ ...r.body, id: r.id, version: r.version, createdAt: iso(r.created_at) });

  app.get("/api/profile", async (c) => {
    const row = await tenant(c, async (q, tenantId) =>
      (await q("SELECT * FROM profile_versions WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1", [tenantId])).rows[0]);
    if (!row) throw notFound("Profile");
    return send(c, api.ProfileVersion, profileToContract(row));
  });

  app.post("/api/profile/versions", async (c) => {
    const input = await body(c, api.ProfileVersionInput);
    const row = await tenant(c, async (q, tenantId) => {
      await q("SELECT pg_advisory_xact_lock(hashtext($1))", [`profile:${tenantId}`]);
      const next = (await q<{ v: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM profile_versions WHERE tenant_id = $1", [tenantId])).rows[0]!.v;
      return (await q("INSERT INTO profile_versions (tenant_id, version, body) VALUES ($1,$2,$3) RETURNING *", [tenantId, next, input])).rows[0];
    });
    return send(c, api.ProfileVersion, profileToContract(row), 201);
  });

  // ───────────────────────── comparisons & runs ─────────────────────────

  const runToContract = (r: any) => ({
    id: r.id,
    status: r.status,
    outcome: r.outcome,
    stage: r.stage,
    cleanup: r.cleanup,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deadlineAt: iso(r.deadline_at),
    lastEventSeq: r.last_event_seq,
    coverage: { evidenceCount: r.evidence_count, candidatesResearched: r.candidates_researched, candidatesTested: r.candidates_tested },
    spend: { currency: r.spend_currency.trim(), reservedMinor: r.reserved_minor, actualMinor: r.actual_minor, capMinor: r.cap_minor },
    pendingApprovalId: r.pending_approval_id,
    recommendationId: r.recommendation_id,
    error: r.error,
  });

  const accepted = (runId: string) => ({ runId, status: "QUEUED" as const, eventsUrl: `/api/runs/${runId}/events`, statusUrl: `/api/runs/${runId}` });

  app.post("/api/comparisons", async (c) => {
    const req = await body(c, api.ComparisonRequest);
    const requestHash = createHash("sha256").update(JSON.stringify(req, Object.keys(req).sort())).digest("hex");

    // Capacity and spend checks before anything is written (PRD §19, §22).
    const paused = runs.pausedReason(config.runMode);
    const capacityError = paused
      ? new HttpError("runner_unavailable", "Live comparisons are paused while the browser runner is checked. Try again later.")
      : (await runs.spendTodayMinor()) >= config.dailySpendCapMinor
        ? new HttpError("budget_exceeded", "Wallio has reached today's spending limit for comparisons. Try again tomorrow.")
        : (await runs.queueDepth(config.runMode)) >= config.worker.maxQueued
          ? new HttpError("quota_exceeded", "Wallio is busy running other comparisons. Try again in a minute.")
          : null;

    const result = await tenant(c, async (q, tenantId) => {
      // Idempotency: same key + same body → same run; same key + different body → conflict.
      const prior = (await q("SELECT c.request_hash, r.id AS run_id FROM comparisons c JOIN runs r ON r.comparison_id = c.id WHERE c.tenant_id = $1 AND c.idempotency_key = $2", [tenantId, req.idempotencyKey])).rows[0];
      if (prior) {
        if (prior.request_hash !== requestHash) throw new HttpError("idempotency_conflict", "This idempotency key was already used for a different comparison. Generate a new key.");
        return { runId: prior.run_id as string, created: false };
      }
      if (capacityError) throw capacityError;

      const profile = (await q("SELECT body FROM profile_versions WHERE id = $1 AND tenant_id = $2", [UUID.test(req.profileVersionId) ? req.profileVersionId : null, tenantId])).rows[0];
      if (!profile) throw new HttpError("validation_failed", "That profile version doesn't exist.", { field: "profileVersionId" });
      if (!profile.body.workflows.some((w: { id: string }) => w.id === req.workflowId)) {
        throw new HttpError("validation_failed", "That workflow isn't in the selected profile.", { field: "workflowId" });
      }
      if (!(await q("SELECT 1 FROM eval_tasks WHERE id = $1", [req.taskId])).rowCount) {
        throw new HttpError("validation_failed", "That task doesn't exist.", { field: "taskId" });
      }
      const toolIds = [req.incumbentToolId, ...req.candidateToolIds];
      if (new Set(toolIds).size !== toolIds.length) throw new HttpError("validation_failed", "Pick different tools for the incumbent and each candidate.", { field: "candidateToolIds" });
      const found = (await q("SELECT id FROM catalog_tools WHERE id = ANY($1)", [toolIds])).rows.map((r) => r.id);
      const missing = toolIds.filter((t) => !found.includes(t));
      if (missing.length) throw new HttpError("validation_failed", "Some tools aren't in the catalog.", { missing });

      // One active comparison per workspace keeps the single runner free for others.
      const active = await q("SELECT id FROM runs WHERE tenant_id = $1 AND status NOT IN ('CLEANED','CLEANUP_FAILED') LIMIT 1", [tenantId]);
      if (active.rowCount) throw new HttpError("conflict", "A comparison is already running. Wait for it to finish or cancel it.", { runId: active.rows[0].id });

      const capMinor = Math.min(req.spendCapMinor ?? config.runSpendCapMinor, config.runSpendCapMinor);
      const cmp = (await q("INSERT INTO comparisons (tenant_id, idempotency_key, request_hash, request) VALUES ($1,$2,$3,$4) RETURNING id", [tenantId, req.idempotencyKey, requestHash, req])).rows[0]!;
      // deadline_at starts as the latest start time; the worker resets it to the execution deadline when it claims the run.
      const run = (await q(
        `INSERT INTO runs (tenant_id, comparison_id, mode, status, deadline_at, cap_minor)
         VALUES ($1,$2,$3,'CREATED', now() + make_interval(secs => $5), $4) RETURNING id`,
        [tenantId, cmp.id, config.runMode, capMinor, config.worker.queueMaxWaitSecs + config.worker.execDeadlineSecs],
      )).rows[0]!;
      await transition(q, tenantId, run.id, "QUEUED");
      await q("INSERT INTO audit_events (tenant_id, actor, action, target, correlation_id) VALUES ($1,'user','comparison.create',$2,$3)", [tenantId, run.id, c.get("correlationId")]);
      return { runId: run.id as string, created: true };
    });

    if (result.created) runs.kick();
    return send(c, api.ComparisonAccepted, accepted(result.runId), 202);
  });

  async function loadRun(q: Query, tenantId: string, id: string) {
    if (!UUID.test(id)) throw notFound("Run");
    const row = (await q("SELECT * FROM runs WHERE id = $1 AND tenant_id = $2", [id, tenantId])).rows[0];
    if (!row) throw notFound("Run");
    return row;
  }

  app.get("/api/runs/:id", async (c) => send(c, api.Run, runToContract(await tenant(c, (q, t) => loadRun(q, t, c.req.param("id"))))));

  app.post("/api/runs/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("tenantId");
    await tenant(c, async (q) => {
      const run = (await q("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [UUID.test(id) ? id : null, tenantId])).rows[0];
      if (!run) throw notFound("Run");
      if (TERMINAL.has(run.status)) throw new HttpError("conflict", "This comparison has already finished.");
      await transition(q, tenantId, id, "CANCELLED", { outcome: "cancelled", message: "You cancelled the comparison" });
      await q("INSERT INTO audit_events (tenant_id, actor, action, target, correlation_id) VALUES ($1,'user','run.cancel',$2,$3)", [tenantId, id, c.get("correlationId")]);
    });
    // The worker sees CANCELLED on its next write or heartbeat and stops; cleanup runs here so the
    // response reflects the verified result (the runner's teardown in live mode).
    await runs.finalize(tenantId, id);
    const row = await tenant(c, (q) => loadRun(q, tenantId, id));
    return send(c, api.Run, runToContract(row));
  });

  // SSE: replays events after Last-Event-ID, then streams new ones until the run is finished.
  app.get("/api/runs/:id/events", async (c) => {
    const tenantId = c.get("tenantId");
    const id = c.req.param("id");
    await db.withTenant(tenantId, (q) => loadRun(q, tenantId, id)); // 404 before opening the stream
    const lastHeader = c.req.header("last-event-id") ?? c.req.query("after") ?? "0";
    let after = Number.parseInt(lastHeader, 10) || 0;

    return streamSSE(c, async (stream) => {
      let idle = 0;
      while (!stream.aborted) {
        const { events, status } = await db.withTenant(tenantId, async (q) => ({
          events: (await q("SELECT * FROM run_events WHERE run_id = $1 AND tenant_id = $2 AND seq > $3 ORDER BY seq LIMIT 200", [id, tenantId, after])).rows,
          status: (await q("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2", [id, tenantId])).rows[0]?.status,
        }));
        for (const e of events) {
          const payload = { runId: e.run_id, seq: e.seq, ts: iso(e.ts), stage: e.stage, type: e.type, message: e.message, data: e.data };
          await stream.writeSSE({ id: String(e.seq), data: JSON.stringify(payload) });
          after = e.seq;
        }
        if (events.length === 0 && FINISHED.has(status)) break;
        if (events.length === 0) {
          if (++idle % 30 === 0) await stream.write(": keep-alive\n\n");
          await stream.sleep(400);
        } else idle = 0;
      }
    });
  });

  // ───────────────────────── results ─────────────────────────

  app.get("/api/recommendations/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound("Recommendation");
    const row = await tenant(c, async (q, t) => (await q("SELECT body FROM recommendations WHERE id = $1 AND tenant_id = $2", [id, t])).rows[0]);
    if (!row) throw notFound("Recommendation");
    return send(c, api.Recommendation, row.body);
  });

  app.get("/api/evidence/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound("Evidence");
    const row = await tenant(c, async (q, t) => (await q("SELECT * FROM evidence WHERE id = $1 AND tenant_id = $2", [id, t])).rows[0]);
    if (!row) throw notFound("Evidence");
    return send(c, api.Evidence, evidenceToContract(row));
  });

  // ───────────────────────── decisions ─────────────────────────

  app.post("/api/decisions", async (c) => {
    const req = await body(c, api.DecisionRequest);
    const out = await tenant(c, async (q, tenantId) => {
      const rec = (await q("SELECT id, profile_version_id, body FROM recommendations WHERE id = $1 AND tenant_id = $2", [UUID.test(req.recommendationId) ? req.recommendationId : null, tenantId])).rows[0];
      if (!rec) throw notFound("Recommendation");
      const evidenceIds = (rec.body.evidence ?? []).map((e: { id: string }) => e.id);
      const row = (await q(
        `INSERT INTO decisions (tenant_id, recommendation_id, profile_version_id, choice, reason, review_date, evidence_snapshot_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenantId, rec.id, rec.profile_version_id, req.choice, req.reason ?? null, req.reviewDate ?? null, evidenceIds],
      )).rows[0];
      await q("INSERT INTO audit_events (tenant_id, actor, action, target, details, correlation_id) VALUES ($1,'user','decision.create',$2,$3,$4)", [tenantId, row.id, { choice: req.choice }, c.get("correlationId")]);
      return row;
    });
    return send(c, api.Decision, {
      id: out.id, recommendationId: out.recommendation_id, choice: out.choice,
      ...(out.reason ? { reason: out.reason } : {}), ...(out.review_date ? { reviewDate: out.review_date } : {}),
      profileVersionId: out.profile_version_id, evidenceSnapshotIds: out.evidence_snapshot_ids, createdAt: iso(out.created_at),
    }, 201);
  });

  // Screenshot bytes, after the same ownership check. Never a public bucket URL.
  app.get("/api/evidence/:id/screenshot", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound("Screenshot");
    const row = await tenant(c, async (q, t) => (await q<{ bytes: Buffer; sha256: string }>("SELECT bytes, sha256 FROM evidence_screenshots WHERE evidence_id = $1 AND tenant_id = $2", [id, t])).rows[0]);
    if (!row) throw notFound("Screenshot");
    return c.body(new Uint8Array(row.bytes), 200, {
      "content-type": "image/png",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "x-content-sha256": row.sha256,
    });
  });

  return app;
}
