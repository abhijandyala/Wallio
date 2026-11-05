import { serve } from "@hono/node-server";
import { loadAppConfig } from "./config.ts";
import { createDb } from "./db/pool.ts";
import { createApp } from "./http/app.ts";
import { LiveExecutorUnavailable, MockCleaner, MockExecutor, NoRunnerCleaner } from "./runs/executors.ts";
import { Worker, type Cleaner, type RunExecutor } from "./runs/worker.ts";
import { LiveCleaner, LiveExecutor } from "./runs/live-executor.ts";
import { RunnerClient } from "./runner/client.ts";
import { createInferenceGateway } from "./inference/index.ts";
import { httpSentinel } from "./runs/containment.ts";

const config = loadAppConfig();
const db = createDb(config.databaseUrl);
// Live runs need the runner. Without it they fail honestly instead of pretending.
let live: { executor: RunExecutor; cleaner: Cleaner } = { executor: new LiveExecutorUnavailable(), cleaner: new NoRunnerCleaner() };
if (config.runner.url && config.runner.token) {
  const runner = new RunnerClient({ baseUrl: config.runner.url, token: config.runner.token, timeoutMs: config.runner.timeoutMs });
  // The owned test page is served from its own https subdomain (Caddy routes eval.<domain>/eval/* here).
  const evalBaseUrl = config.evalOrigin;
  if (config.runner.url.startsWith("https://") && config.runner.caFile && process.env.NODE_EXTRA_CA_CERTS !== config.runner.caFile) {
    console.log(JSON.stringify({ level: "warn", msg: "RUNNER_CA_FILE is set but NODE_EXTRA_CA_CERTS points elsewhere; the runner's certificate may not be trusted", caFile: config.runner.caFile }));
  }
  live = {
    executor: new LiveExecutor({
      runner, gateway: (onUsage) => createInferenceGateway({ onUsage }), evalBaseUrl,
      formsBaseUrl: config.formsOrigin, approvalKey: config.runner.approvalKey, approvalTtlSecs: config.approvalTtlSecs,
      hostileBaseUrl: config.hostileOrigin, sentinel: config.sentinelUrl ? httpSentinel(config.sentinelUrl) : null,
    }),
    cleaner: new LiveCleaner(runner),
  };
}
const worker = new Worker({
  db,
  config,
  executors: { mock: new MockExecutor(config.mockStepMs, { approvalTtlSecs: config.approvalTtlSecs }), live: live.executor },
  cleaners: { mock: new MockCleaner(), live: live.cleaner },
});
const app = createApp({ config, db, runs: worker });

worker.start();
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(JSON.stringify({ level: "info", msg: "wallio api listening", host: config.host, port: info.port, runMode: config.runMode, worker: worker.owner, runner: config.runner.url ? "configured" : "not configured" }));
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    void worker.stop().finally(() => db.close().finally(() => process.exit(0)));
  });
}
