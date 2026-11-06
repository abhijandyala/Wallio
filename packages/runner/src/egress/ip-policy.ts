/**
 * Destination policy shared by the egress proxy and the daemon (PRD §14).
 * Self-contained (node built-ins only) because it is copied into the proxy image.
 *
 * Rules: HTTPS on 443 only, exact hostname match against the job allowlist,
 * no IP literals, and every DNS answer must be a public address.
 */
import { BlockList, isIP } from "node:net";

export type DenyReason = "host_not_allowed" | "private_range" | "ip_literal" | "non_https" | "bad_port" | "dns_failed" | "byte_cap";

const denied = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) denied.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) denied.addSubnet(net, prefix, "ipv6");

/** Embedded IPv4 in ::ffff:a.b.c.d or ::a.b.c.d forms, so a mapped private address can't slip through. */
function embeddedV4(addr: string): string | null {
  const m = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (m) return m[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(addr);
  if (hex) {
    const a = parseInt(hex[1]!, 16), b = parseInt(hex[2]!, 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

/** True if this address must never be reached from a job. */
export function isDeniedAddress(addr: string): boolean {
  const clean = addr.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
  const fam = isIP(clean);
  if (fam === 0) return true; // not an address at all: refuse
  if (fam === 4) return denied.check(clean, "ipv4");
  const v4 = embeddedV4(clean);
  if (v4) return denied.check(v4, "ipv4");
  if (clean.startsWith("::ffff:")) return true;
  return denied.check(clean, "ipv6");
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Pre-DNS check of a CONNECT/navigate target against one job's allowlist. */
export function checkTarget(host: string, port: number, allowed: ReadonlySet<string>): DenyReason | null {
  const h = normalizeHost(host).replace(/^\[|\]$/g, "");
  if (isIP(h)) return isDeniedAddress(h) ? "private_range" : "ip_literal";
  if (port !== 443) return "bad_port";
  if (!allowed.has(h)) return "host_not_allowed";
  return null;
}

/** Post-DNS check: every answer must be public (conservative against mixed answers and rebinding). */
export function checkResolved(addresses: readonly string[]): DenyReason | null {
  if (addresses.length === 0) return "dns_failed";
  return addresses.some(isDeniedAddress) ? "private_range" : null;
}

export const DENY_MESSAGES: Record<DenyReason, string> = {
  host_not_allowed: "is not on this job's allowed host list",
  private_range: "is a private, loopback, link-local or metadata address",
  ip_literal: "is a raw IP address; only allowed hostnames may be used",
  non_https: "is not HTTPS; only HTTPS on port 443 is allowed",
  bad_port: "uses a port other than 443",
  dns_failed: "could not be resolved",
  byte_cap: "exceeded this job's download budget",
};
