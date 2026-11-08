/**
 * Wallio's web app (web/, Next.js) on Railway. See README.md in this folder.
 *
 * Only the web app runs here. The API, Postgres and the browser runner stay on Vultr: the
 * runner needs its own Docker host, and the hackathon wants the backend on Vultr. The web
 * app proxies /api to the Vultr API (web/src/app/api/[...path]/route.ts), so the browser
 * only ever talks to this one site and the guest cookie stays first-party.
 *
 * This file is a named partial, so it manages the "web" service and nothing else in the
 * project: services it doesn't declare are left alone.
 */
import { defineRailway, github, project, service } from "railway/iac";

export const partial = "web";

/** The Wallio API on Vultr. Change it here to point the Railway site at another API. */
const API_ORIGIN = "https://149-28-76-16.sslip.io";

export default defineRailway((ctx) => {
  const web = service("web", {
    source: github("abhijandyala/Wallio", { branch: "main", rootDirectory: "web" }),
    // Railpack detects Next.js from web/package.json (Node from "engines") and runs
    // `npm ci`, `npm run build`, then `npm start`; Next listens on Railway's $PORT.
    build: { builder: "RAILPACK", watchPatterns: ["/web/**"] },
    healthcheck: "/",
    healthcheckTimeout: 120,
    env: {
      WALLIO_API_ORIGIN: API_ORIGIN,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  return project(ctx.projectName ?? "Wallio", { resources: [web] });
});
