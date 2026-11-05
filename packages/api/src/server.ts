import { serve } from "@hono/node-server";
import { loadAppConfig } from "./config.ts";
import { createDb } from "./db/pool.ts";
import { createApp } from "./http/app.ts";
import { LiveExecutorUnavailable, MockCleaner, MockExecutor, NoRunnerCleaner } from "./runs/executors.ts";
import { Worker } from "./runs/worker.ts";

const config = loadAppConfig();
const db = createDb(config.databaseUrl);
const worker = new Worker({
  db,
  config,
  executors: { mock: new MockExecutor(config.mockStepMs), live: new LiveExecutorUnavailable() },
  cleaners: { mock: new MockCleaner(), live: new NoRunnerCleaner() },
});
const app = createApp({ config, db, runs: worker });

worker.start();
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(JSON.stringify({ level: "info", msg: "wallio api listening", host: config.host, port: info.port, runMode: config.runMode, worker: worker.owner }));
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    void worker.stop().finally(() => db.close().finally(() => process.exit(0)));
  });
}
