/**
 * Small on-disk state, so a daemon restart can still answer honestly:
 * job records, used approval nonces and screenshots. Files are mode 600
 * and written atomically (temp file + rename).
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1), { mode: 0o600 });
  renameSync(tmp, path);
}

export function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Approval nonces that were already consumed (PRD §15: consume atomically with dispatch). */
export class NonceStore {
  private used = new Map<string, number>();
  private path: string;

  constructor(dir: string) {
    this.path = join(ensureDir(dir), "used-nonces.json");
    const saved = readJson<Record<string, number>>(this.path) ?? {};
    for (const [n, exp] of Object.entries(saved)) this.used.set(n, exp);
  }

  /** Returns false if the nonce was already used. Persists before returning true. */
  consume(nonce: string, exp: number, nowS = Math.floor(Date.now() / 1000)): boolean {
    for (const [n, e] of this.used) if (e + 3600 < nowS) this.used.delete(n);
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, exp);
    writeJsonAtomic(this.path, Object.fromEntries(this.used));
    return true;
  }
}

export interface ScreenshotMeta {
  artifactId: string;
  jobId: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: "image/png";
  createdAt: string;
  /** Set once the job is cleaned; the file is purged after this. */
  expiresAt: string | null;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

/** Validates a PNG coming out of a job container: magic bytes, IHDR, sane size. */
export function inspectPng(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 33 || buf.length > MAX_SCREENSHOT_BYTES) return null;
  if (!buf.subarray(0, 8).equals(PNG_MAGIC) || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 10_000) return null;
  return { width, height };
}

export class ArtifactStore {
  private dir: string;

  constructor(stateDir: string) {
    this.dir = ensureDir(join(stateDir, "artifacts"));
  }

  put(jobId: string, png: Buffer): ScreenshotMeta | null {
    const dims = inspectPng(png);
    if (!dims) return null;
    const artifactId = `art_${randomBytes(12).toString("hex")}`;
    const meta: ScreenshotMeta = {
      artifactId, jobId, ...dims, bytes: png.length, mimeType: "image/png",
      sha256: `sha256:${createHash("sha256").update(png).digest("hex")}`,
      createdAt: new Date().toISOString(), expiresAt: null,
    };
    writeFileSync(join(this.dir, `${artifactId}.png`), png, { mode: 0o600 });
    writeJsonAtomic(join(this.dir, `${artifactId}.json`), meta);
    return meta;
  }

  get(artifactId: string): { meta: ScreenshotMeta; png: Buffer } | null {
    if (!/^art_[a-f0-9]{24}$/.test(artifactId)) return null;
    const meta = readJson<ScreenshotMeta>(join(this.dir, `${artifactId}.json`));
    if (!meta || (meta.expiresAt && Date.parse(meta.expiresAt) < Date.now())) return null;
    try {
      return { meta, png: readFileSync(join(this.dir, `${artifactId}.png`)) };
    } catch {
      return null;
    }
  }

  /** Start the retention clock for a job's screenshots. */
  expireJob(jobId: string, ttlMs: number): void {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    for (const meta of this.all()) if (meta.jobId === jobId && !meta.expiresAt) writeJsonAtomic(join(this.dir, `${meta.artifactId}.json`), { ...meta, expiresAt });
  }

  purgeExpired(): number {
    let n = 0;
    for (const meta of this.all()) {
      if (meta.expiresAt && Date.parse(meta.expiresAt) < Date.now()) {
        rmSync(join(this.dir, `${meta.artifactId}.png`), { force: true });
        rmSync(join(this.dir, `${meta.artifactId}.json`), { force: true });
        n++;
      }
    }
    return n;
  }

  private all(): ScreenshotMeta[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => readJson<ScreenshotMeta>(join(this.dir, f))).filter((m): m is ScreenshotMeta => !!m);
  }
}
