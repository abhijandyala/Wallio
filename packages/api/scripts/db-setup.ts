/**
 * Creates the app role and database if missing, applies migrations and seeds
 * the global catalog. Safe to re-run.
 *
 *   npm run db:setup                 # uses .env
 *   npm run db:setup -- --reset      # drop and recreate the schema (dev/test only)
 *
 * Needs DATABASE_ADMIN_URL (owner/superuser) and DATABASE_URL (app role).
 */
import pg from "pg";
import { parseArgs } from "node:util";
import { migrate } from "../src/db/migrate.ts";
import { seedCatalog } from "../src/seed/catalog.ts";

const { values } = parseArgs({ options: { reset: { type: "boolean", default: false } } });

export async function setupDatabase(adminUrl: string, appUrl: string, opts: { reset?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const app = new URL(appUrl);
  const admin = new URL(adminUrl);
  const dbName = admin.pathname.slice(1);
  const role = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (!role || !password) throw new Error("DATABASE_URL must include the app role's user and password.");
  if (role === decodeURIComponent(admin.username)) throw new Error("DATABASE_URL must use a different role than DATABASE_ADMIN_URL.");

  // 1. role + database, via the maintenance database
  const maint = new URL(adminUrl); maint.pathname = "/postgres";
  const c = new pg.Client({ connectionString: maint.toString() });
  await c.connect();
  try {
    const exists = (await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount;
    const ident = pg.escapeIdentifier(role);
    const lit = pg.escapeLiteral(password);
    await c.query(exists ? `ALTER ROLE ${ident} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${lit}` : `CREATE ROLE ${ident} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${lit}`);
    if (!(await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])).rowCount) {
      await c.query(`CREATE DATABASE ${pg.escapeIdentifier(dbName)}`);
      log(`  created database ${dbName}`);
    }
  } finally {
    await c.end();
  }

  // 2. optional reset
  if (opts.reset) {
    const r = new pg.Client({ connectionString: adminUrl });
    await r.connect();
    await r.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO " + pg.escapeIdentifier(role));
    await r.end();
    log("  reset schema public");
  }
  {
    const g = new pg.Client({ connectionString: adminUrl });
    await g.connect();
    await g.query(`GRANT CONNECT ON DATABASE ${pg.escapeIdentifier(dbName)} TO ${pg.escapeIdentifier(role)}; GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(role)}`);
    await g.end();
  }

  // 3. migrations + catalog
  await migrate(adminUrl, log);
  const s = new pg.Client({ connectionString: adminUrl });
  await s.connect();
  const n = await seedCatalog((sql, params) => s.query(sql, params as any[]));
  await s.end();
  log(`  catalog: ${n} tools`);
}

if (import.meta.main) {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!adminUrl || !appUrl) {
    console.error("Set DATABASE_ADMIN_URL and DATABASE_URL in .env (see .env.example).");
    process.exit(1);
  }
  console.log(`Setting up ${new URL(adminUrl).pathname.slice(1)}${values.reset ? " (reset)" : ""}`);
  await setupDatabase(adminUrl, appUrl, { reset: values.reset });
  console.log("Done.");
}
