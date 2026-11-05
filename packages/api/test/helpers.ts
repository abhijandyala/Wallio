import pg from "pg";
import type { AppConfig } from "../src/config.ts";

process.env.NODE_ENV = "test";

export const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? "";
export const APP = process.env.TEST_DATABASE_URL ?? "";
if (!ADMIN || !APP) throw new Error("Set TEST_DATABASE_ADMIN_URL and TEST_DATABASE_URL in .env");

export const testConfig = (over: Partial<AppConfig> = {}, worker: Partial<AppConfig["worker"]> = {}): AppConfig => ({
  databaseUrl: APP,
  port: 0,
  host: "127.0.0.1",
  runMode: "mock",
  cookieSecure: false,
  appOrigin: "http://localhost:5173",
  sessionTtlHours: 1,
  runSpendCapMinor: 50,
  runEstimateMinor: 5,
  dailySpendCapMinor: 100_000,
  mockStepMs: 5,
  runner: { url: null, token: null, timeoutMs: 5000, approvalKey: null, caFile: null },
  evalOrigin: null,
  ...over,
  worker: {
    leaseSecs: 3,
    execDeadlineSecs: 30,
    queueMaxWaitSecs: 60,
    maxQueued: 50,
    cleanupMaxSecs: 5,
    concurrency: { mock: 8, live: 2 },
    pollMs: 50,
    ...worker,
  },
});

/** Runs SQL as the DB owner (bypasses RLS). Test-only. */
export async function asAdmin<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: ADMIN });
  await c.connect();
  try {
    return (await c.query(sql, params as any[])).rows as T[];
  } finally {
    await c.end();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000, step = 25): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await sleep(step);
  }
}

/** A browser-like visitor with its own cookie jar. */
export class Visitor {
  cookie = "";
  private a: { request: (p: string, i?: RequestInit) => Response | Promise<Response> };
  constructor(a: { request: (p: string, i?: RequestInit) => Response | Promise<Response> }) {
    this.a = a;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.a.request(path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return res;
  }
  async json(method: string, path: string, body?: unknown) {
    const res = await this.req(method, path, body);
    return { status: res.status, body: (await res.json()) as any, headers: res.headers };
  }
  async comparison(over: Record<string, unknown> = {}) {
    const profile = (await this.json("GET", "/api/profile")).body;
    return {
      idempotencyKey: crypto.randomUUID(), profileVersionId: profile.id, workflowId: "wf_debugging", taskId: "task_js_offbyone_v1",
      incumbentToolId: "tool_copilot", candidateToolIds: ["tool_zed"], ...over,
    };
  }
  async startRun(over: Record<string, unknown> = {}) {
    return this.json("POST", "/api/comparisons", await this.comparison(over));
  }
  async run(runId: string) {
    return (await this.json("GET", `/api/runs/${runId}`)).body;
  }
  async waitFinished(runId: string, ms = 8000) {
    return until(async () => {
      const r = await this.run(runId);
      return r.status === "CLEANED" || r.status === "CLEANUP_FAILED" ? r : null;
    }, ms);
  }
  async events(runId: string, after = 0) {
    const res = await this.req("GET", `/api/runs/${runId}/events`, undefined, after ? { "last-event-id": String(after) } : {});
    if (res.status !== 200) throw new Error(`events ${res.status}`);
    const text = await res.text();
    return text.split("\n\n").filter((b) => b.includes("data:")).map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data:"))!.slice(5)));
  }
}
