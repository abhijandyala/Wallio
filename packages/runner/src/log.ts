/** JSON-lines logs: metadata only. Never page text, field values, tokens or screenshots. */
export function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}): void {
  if (process.env.RUNNER_LOG === "silent") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
