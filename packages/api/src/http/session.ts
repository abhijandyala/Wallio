/**
 * Guest sessions. Every visitor gets their own workspace (tenant) with demo
 * data; nobody ever shares a demo account. The cookie holds a random token;
 * the database stores only its sha256.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/pool.ts";
import { seedDemoWorkspace } from "../seed/demo-workspace.ts";

export const SESSION_COOKIE = "wallio_sid";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function findSession(db: Db, token: string | undefined): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const r = await db.withSystem((q) =>
    q<{ workspace_id: string }>("SELECT workspace_id FROM sessions WHERE token_hash = $1 AND expires_at > now()", [hash(token)]),
  );
  return r.rows[0]?.workspace_id ?? null;
}

/** Creates a guest workspace, its session and its demo data. Returns the cookie token. */
export async function createGuestSession(db: Db, ttlHours: number): Promise<{ token: string; workspaceId: string }> {
  const token = randomBytes(32).toString("base64url");
  const workspaceId = await db.withSystem(async (q) => {
    const ws = await q<{ id: string }>(
      "INSERT INTO workspaces (kind, expires_at) VALUES ('guest', now() + make_interval(hours => $1)) RETURNING id",
      [ttlHours],
    );
    const id = ws.rows[0]!.id;
    await q("INSERT INTO sessions (token_hash, workspace_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))", [hash(token), id, ttlHours]);
    return id;
  });
  await db.withTenant(workspaceId, (q) => seedDemoWorkspace(q, workspaceId));
  return { token, workspaceId };
}
