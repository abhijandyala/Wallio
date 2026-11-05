export interface WorkerConfig {
  /** Lease length. The worker renews it every third of this while a run executes. */
  leaseSecs: number;
  /** Hard execution deadline from claim to finish (PRD §14: 180 s). */
  execDeadlineSecs: number;
  /** A run that waits in the queue longer than this fails with a clear message. */
  queueMaxWaitSecs: number;
  /** New comparisons are refused while this many are already queued. */
  maxQueued: number;
  /** CLEANING longer than this is marked CLEANUP_FAILED. */
  cleanupMaxSecs: number;
  /** Concurrent runs per mode on this worker. Live runs share one browser runner. */
  concurrency: { mock: number; live: number };
  /** How often the worker looks for work and stale runs. */
  pollMs: number;
}

export interface AppConfig {
  /** App role (wallio_app, not a superuser) so row-level security applies. */
  databaseUrl: string;
  port: number;
  /** Interface to listen on. Localhost by default: only Caddy talks to the API. */
  host: string;
  /** "mock" plays a scripted run; "live" uses the real planner and browser runner. */
  runMode: "mock" | "live";
  cookieSecure: boolean;
  /** If set, mutating requests with an Origin header must match it. */
  appOrigin: string | null;
  sessionTtlHours: number;
  /** Per-run execution spend ceiling in USD cents, enforced server-side. */
  runSpendCapMinor: number;
  /** Amount reserved per live run before dispatch, in USD cents. */
  runEstimateMinor: number;
  /** Kill switch: no new runs once today's committed spend reaches this, in USD cents. */
  dailySpendCapMinor: number;
  /** Delay between mock run steps. */
  mockStepMs: number;
  worker: WorkerConfig;
  /** Adhvik's runner daemon on the private network. Live mode needs both. */
  runner: { url: string | null; token: string | null; timeoutMs: number };
}

export function loadAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set (see .env.example).");
  const runMode = (env.RUN_MODE ?? "mock").trim();
  if (runMode !== "mock" && runMode !== "live") throw new Error(`RUN_MODE must be mock or live, got ${runMode}`);
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    databaseUrl,
    port: n(env.PORT, 8787),
    host: env.HOST?.trim() || "127.0.0.1",
    runMode,
    cookieSecure: env.COOKIE_SECURE === "true",
    appOrigin: env.APP_ORIGIN?.trim() || null,
    sessionTtlHours: n(env.SESSION_TTL_HOURS, 72),
    runSpendCapMinor: n(env.RUN_SPEND_CAP_MINOR, 50),
    runEstimateMinor: n(env.RUN_ESTIMATE_MINOR, 5),
    dailySpendCapMinor: n(env.DAILY_SPEND_CAP_MINOR, 500),
    mockStepMs: n(env.MOCK_STEP_MS, 700),
    worker: {
      leaseSecs: n(env.WORKER_LEASE_SECS, 15),
      execDeadlineSecs: n(env.RUN_DEADLINE_SECS, 180),
      queueMaxWaitSecs: n(env.QUEUE_MAX_WAIT_SECS, 120),
      maxQueued: n(env.MAX_QUEUED_RUNS, 5),
      cleanupMaxSecs: n(env.CLEANUP_MAX_SECS, 60),
      concurrency: { mock: n(env.MOCK_CONCURRENCY, 4), live: n(env.LIVE_CONCURRENCY, 1) },
      pollMs: n(env.WORKER_POLL_MS, 500),
    },
    runner: { url: env.RUNNER_URL?.trim() || null, token: env.RUNNER_SHARED_TOKEN?.trim() || null, timeoutMs: n(env.RUNNER_TIMEOUT_MS, 30_000) },
  };
}
