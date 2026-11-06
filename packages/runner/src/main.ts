/** Runner daemon entry point. */
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { loadRunnerConfig } from "./config.ts";
import { DockerDriver } from "./sandbox/docker.ts";
import { FakeDriver } from "./drivers/fake.ts";
import { JobService } from "./jobs/service.ts";
import { createRunnerApp } from "./server.ts";
import { log } from "./log.ts";

const cfg = loadRunnerConfig();
const driver = cfg.driver === "docker" ? new DockerDriver(cfg) : new FakeDriver();
await driver.init();
const service = new JobService({ cfg, driver });
await service.recover();
service.startSweeper();

const app = createRunnerApp(service, cfg.sharedToken);
const server = serve({
  fetch: app.fetch,
  hostname: cfg.bindHost,
  port: cfg.port,
  ...(cfg.tls ? { createServer: createHttpsServer, serverOptions: { cert: cfg.tls.cert, key: cfg.tls.key, minVersion: "TLSv1.2" as const } } : {}),
});
log("info", "runner listening", {
  url: `${cfg.tls ? "https" : "http"}://${cfg.bindHost}:${cfg.port}`,
  driver: driver.name,
  imageDigest: driver.imageDigest(),
  testMode: cfg.testMode,
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    log("info", "shutting down: cancelling active jobs and cleaning up", { signal: sig });
    server.close();
    await service.close();
    process.exit(0);
  });
}
