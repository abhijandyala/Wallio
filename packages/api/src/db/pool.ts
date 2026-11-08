import pg from "pg";

// Return bigint (int8) as JS number. Amounts stay well below 2^53 cents.
pg.types.setTypeParser(20, (v) => Number(v));
// Return DATE columns as "YYYY-MM-DD" strings, not JS Dates shifted by timezone.
pg.types.setTypeParser(1082, (v) => v);

export type Query = <R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<pg.QueryResult<R>>;

export interface Db {
  pool: pg.Pool;
  /**
   * Runs `fn` in one transaction scoped to a tenant. Sets app.tenant_id so
   * row-level security applies; callers still filter on tenant_id explicitly.
   */
  withTenant<T>(tenantId: string, fn: (q: Query) => Promise<T>): Promise<T>;
  /** Unscoped transaction, only for sessions/workspaces and global catalog reads. */
  withSystem<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });

  async function tx<T>(tenantId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const q: Query = (sql, params) => client.query(sql, params as any[]);
      const out = await fn(q);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    withTenant: (tenantId, fn) => tx(tenantId, fn),
    withSystem: (fn) => tx(null, fn),
    close: () => pool.end(),
  };
}
