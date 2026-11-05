/**
 * In-memory fixed-window limiter (one API process; resets on restart, which is fine
 * for a guest demo). Durable quotas (runs per workspace per day) are counted in the
 * database instead.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Counts one hit for key. Returns null if allowed, or the seconds until the window resets. */
  hit(key: string): number | null {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      w = { start: t, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 50_000) this.prune(t);
    }
    w.count++;
    return w.count > this.limit ? Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000)) : null;
  }

  private prune(t: number) {
    for (const [k, w] of this.windows) if (t - w.start >= this.windowMs) this.windows.delete(k);
  }
}

/**
 * The client's address. The API listens on localhost behind Caddy, which sets
 * X-Forwarded-For itself (it does not trust incoming values by default), so the last
 * entry is the address Caddy saw. Direct callers (tests, curl on the box) fall back to "local".
 */
export function clientIp(xff: string | undefined): string {
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return last && last.length <= 64 ? last : "local";
}
