/**
 * Runner HTTP API (docs/CONTRACTS.md §B). Only the control VM calls it, over
 * the private network, with `Authorization: Bearer $RUNNER_SHARED_TOKEN`.
 * Every input is validated against @wallio/contracts; every non-2xx body is a
 * RunnerHttpError.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z, ZodType } from "zod";
import { runner as C } from "@wallio/contracts";
import { JobService, RunnerHttpError } from "./jobs/service.ts";
import { log } from "./log.ts";

const JOB_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export function createRunnerApp(service: JobService, sharedToken: string) {
  const app = new Hono();
  const tokenHash = createHash("sha256").update(sharedToken).digest();

  type HttpError = z.infer<typeof C.RunnerHttpError>;
  const err = (c: Context, status: number, code: HttpError["code"], message: string) =>
    c.json({ code, message } satisfies HttpError, status as any);

  app.use("*", async (c, next) => {
    const t = performance.now();
    await next();
    log("info", "http", { method: c.req.method, path: c.req.path.replace(/\/(jobs|artifacts)\/[^/]+/, "/$1/:id"), status: c.res.status, ms: Math.round(performance.now() - t) });
  });

  app.use("*", async (c, next) => {
    const m = /^Bearer\s+(.+)$/.exec(c.req.header("authorization") ?? "");
    const given = createHash("sha256").update(m?.[1] ?? "").digest();
    if (!m || !timingSafeEqual(given, tokenHash)) return err(c, 401, "unauthorized", "Missing or wrong bearer token.");
    await next();
  });

  app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => err(c, 413, "bad_request", "Request body is larger than 64 KB.") }));

  app.onError((e, c) => {
    if (e instanceof RunnerHttpError) return err(c, e.status, e.code, e.message);
    log("error", "unhandled", { path: c.req.path, error: (e as Error).message });
    return err(c, 500, "internal", "Something went wrong in the runner.");
  });
  app.notFound((c) => err(c, 404, "bad_request", "No such endpoint."));

  async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new RunnerHttpError(400, "bad_request", "Body must be JSON.");
    }
    const r = schema.safeParse(raw);
    if (!r.success) throw new RunnerHttpError(400, "bad_request", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).slice(0, 5).join("; "));
    return r.data;
  }
  const jobId = (c: Context) => {
    const id = c.req.param("id") ?? "";
    if (!JOB_ID.test(id)) throw new RunnerHttpError(404, "job_not_found", "No such job.");
    return id;
  };

  app.get("/healthz", async (c) => c.json(await service.health()));

  app.post("/jobs", async (c) => {
    const spec = await body(c, C.RunnerJobCreate);
    // Job IDs end up in URLs, Docker labels and file names: keep them to a safe alphabet.
    if (!JOB_ID.test(spec.jobId)) throw new RunnerHttpError(400, "bad_request", "jobId may only contain letters, digits, '_', '.', ':' and '-'.");
    return c.json(await service.create(spec), 201);
  });
  app.get("/jobs/:id", (c) => c.json(service.status(jobId(c))));
  app.post("/jobs/:id/actions", async (c) => {
    const id = jobId(c);
    return c.json(await service.act(id, await body(c, C.RunnerActionRequest)));
  });
  app.post("/jobs/:id/finish", async (c) => c.json(await service.finish(jobId(c))));
  app.post("/jobs/:id/cancel", async (c) => {
    const id = jobId(c);
    const { reason } = await body(c, C.RunnerCancelRequest);
    service.cancel(id, reason);
    return c.json({ jobId: id, accepted: true }, 202);
  });
  app.get("/jobs/:id/cleanup", (c) => c.json(service.cleanupReport(jobId(c))));

  app.get("/artifacts/:artifactId", (c) => {
    const a = service.artifacts.get(c.req.param("artifactId"));
    if (!a) return err(c, 404, "job_not_found", "No such screenshot, or it has expired.");
    return c.body(new Uint8Array(a.png), 200, {
      "content-type": "image/png",
      "content-length": String(a.png.length),
      "x-content-sha256": a.meta.sha256,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  });

  return app;
}
