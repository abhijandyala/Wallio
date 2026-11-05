import { serve } from "@hono/node-server";
import { loadAppConfig } from "./config.ts";
import { createDb } from "./db/pool.ts";
import { createApp } from "./http/app.ts";

const config = loadAppConfig();
const db = createDb(config.databaseUrl);
const app = createApp({ config, db });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(JSON.stringify({ level: "info", msg: "wallio api listening", port: info.port, runMode: config.runMode }));
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    void db.close().finally(() => process.exit(0));
  });
}
