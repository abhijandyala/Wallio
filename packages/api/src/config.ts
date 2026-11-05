export interface AppConfig {
  /** App role (wallio_app, not a superuser) so row-level security applies. */
  databaseUrl: string;
  port: number;
  /** Interface to listen on. Localhost by default: only Caddy talks to the API. */
  host: string;
  /** "mock" plays a scripted run until the real orchestrator (P4) exists. */
  runMode: "mock" | "live";
  cookieSecure: boolean;
  /** If set, mutating requests with an Origin header must match it. */
  appOrigin: string | null;
  sessionTtlHours: number;
  /** Per-run execution spend ceiling in USD cents, enforced server-side. */
  runSpendCapMinor: number;
  /** Delay between mock run steps. */
  mockStepMs: number;
}

export function loadAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set (see .env.example).");
  const runMode = (env.RUN_MODE ?? "mock").trim();
  if (runMode !== "mock" && runMode !== "live") throw new Error(`RUN_MODE must be mock or live, got ${runMode}`);
  return {
    databaseUrl,
    port: Number(env.PORT) || 8787,
    host: env.HOST?.trim() || "127.0.0.1",
    runMode,
    cookieSecure: env.COOKIE_SECURE === "true",
    appOrigin: env.APP_ORIGIN?.trim() || null,
    sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 72,
    runSpendCapMinor: Number(env.RUN_SPEND_CAP_MINOR) || 50,
    mockStepMs: Number(env.MOCK_STEP_MS) || 700,
  };
}
