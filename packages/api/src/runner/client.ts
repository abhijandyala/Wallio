/**
 * Client for Adhvik's runner daemon (docs/CONTRACTS.md §B).
 *
 * - Bearer token on every request; the runner never receives provider or cloud credentials.
 * - Every response is validated against the shared contract: runner output is untrusted.
 * - Read-only actions are retried on transport failure at most twice. An action that
 *   carries an approval token (an external effect) is never retried automatically: an
 *   uncertain outcome is reported as such (PRD §15).
 */
import { runner as rc } from "@wallio/contracts";
import type { z } from "zod";

export type RunnerErrorCode = z.infer<typeof rc.RunnerErrorCode> | "unauthorized" | "bad_request" | "busy" | "unreachable" | "invalid_response" | "outcome_uncertain";

export class RunnerError extends Error {
  override name = "RunnerError";
  readonly code: RunnerErrorCode;
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(code: RunnerErrorCode, message: string, opts: { retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status ?? null;
  }
}

export interface RunnerClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

export class RunnerClient {
  private readonly base: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(o: RunnerClientOptions) {
    const u = new URL(o.baseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("RUNNER_URL must be http(s)");
    if (!o.token || o.token.length < 24) throw new Error("RUNNER_SHARED_TOKEN must be at least 24 characters");
    this.base = o.baseUrl.replace(/\/+$/, "");
    this.token = o.token;
    this.timeoutMs = o.timeoutMs ?? 30_000;
    this.fetchImpl = o.fetch ?? globalThis.fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  createJob(spec: rc.RunnerJobCreate): Promise<rc.RunnerJobStatus> {
    return this.call("POST", "/jobs", rc.RunnerJobCreate.parse(spec), rc.RunnerJobStatus);
  }

  status(jobId: string): Promise<rc.RunnerJobStatus> {
    return this.call("GET", `/jobs/${encodeURIComponent(jobId)}`, undefined, rc.RunnerJobStatus);
  }

  /** One browser action. Retries transport failures for read-only actions only. */
  async act(jobId: string, req: rc.RunnerActionRequest): Promise<rc.RunnerActionResult> {
    const body = rc.RunnerActionRequest.parse(req);
    const external = body.action.type === "click" && Boolean(body.action.approvalToken);
    const attempts = external ? 1 : 3;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        // Same actionId on retry: the runner returns the stored result instead of re-executing.
        return await this.call("POST", `/jobs/${encodeURIComponent(jobId)}/actions`, body, rc.RunnerActionResult);
      } catch (e) {
        last = e;
        const transient = e instanceof RunnerError && (e.code === "unreachable" || e.retryable);
        if (external && transient) {
          throw new RunnerError("outcome_uncertain", "The runner did not confirm whether the approved action happened. It was not retried.");
        }
        if (!transient || i === attempts - 1) break;
        await this.sleep(300 * 2 ** i);
      }
    }
    throw last;
  }

  finish(jobId: string): Promise<rc.CleanupReport> {
    return this.call("POST", `/jobs/${encodeURIComponent(jobId)}/finish`, {}, rc.CleanupReport);
  }

  async cancel(jobId: string, reason: z.infer<typeof rc.RunnerCancelRequest>["reason"]): Promise<void> {
    await this.raw("POST", `/jobs/${encodeURIComponent(jobId)}/cancel`, rc.RunnerCancelRequest.parse({ reason }));
  }

  cleanup(jobId: string): Promise<rc.CleanupReport> {
    return this.call("GET", `/jobs/${encodeURIComponent(jobId)}/cleanup`, undefined, rc.CleanupReport);
  }

  /** Downloads a screenshot. Type and size are checked here as well as by the daemon. */
  async artifact(artifactId: string): Promise<Buffer> {
    const res = await this.raw("GET", `/artifacts/${encodeURIComponent(artifactId)}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/png")) throw new RunnerError("invalid_response", `artifact has type ${type || "unknown"}, expected image/png`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ARTIFACT_BYTES) throw new RunnerError("invalid_response", "artifact is larger than 5 MB");
    if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new RunnerError("invalid_response", "artifact is not a PNG");
    return buf;
  }

  // ── transport ──

  private async call<T>(method: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const res = await this.raw(method, path, body);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new RunnerError("invalid_response", `runner returned non-JSON for ${method} ${path}`);
    }
    const r = schema.safeParse(json);
    if (!r.success) {
      throw new RunnerError("invalid_response", `runner response for ${method} ${path} breaks the contract: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return r.data;
  }

  private async raw(method: string, path: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new RunnerError("unreachable", `runner unreachable (${(e as Error).name})`, { retryable: true });
    }
    if (res.ok) return res;
    let code: RunnerErrorCode = res.status === 401 ? "unauthorized" : res.status === 503 ? "busy" : "bad_request";
    let message = `runner returned ${res.status}`;
    try {
      const e = rc.RunnerHttpError.safeParse(await res.json());
      if (e.success) {
        code = e.data.code;
        message = e.data.message.slice(0, 200);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new RunnerError(code, message, { status: res.status, retryable: res.status >= 500 || res.status === 429 });
  }
}
