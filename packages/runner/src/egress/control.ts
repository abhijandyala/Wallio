/** Daemon-side client for the egress proxy's control API (host loopback only). */
import type { Denial } from "../drivers/types.ts";

export class EgressControl {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status === 404 && method !== "PUT") return null;
    if (!res.ok) throw new Error(`egress control ${method} ${path} → ${res.status}`);
    return res.json();
  }

  async healthy(): Promise<boolean> {
    try {
      return (await this.call("GET", "/healthz"))?.ok === true;
    } catch {
      return false;
    }
  }

  register(user: string, job: { jobId: string; pass: string; allowedHosts: string[]; byteCap: number }) {
    return this.call("PUT", `/jobs/${user}`, job);
  }

  async denials(user: string, since: number): Promise<{ denials: Denial[]; next: number }> {
    return (await this.call("GET", `/jobs/${user}/denials?since=${since}`)) ?? { denials: [], next: since };
  }

  /** Unregisters the job and closes its open tunnels. Returns its full denial list (null if unknown). */
  async unregister(user: string): Promise<{ denials: Denial[] } | null> {
    return this.call("DELETE", `/jobs/${user}`);
  }
}
