import type { AgentOp, AgentReply } from "../../agent/protocol.ts";
import type { DenyReason } from "../egress/ip-policy.ts";

export interface Denial { url: string; reason: DenyReason | string; at: string }

export interface SandboxRef {
  /** Container and volume name (same string). */
  name: string;
  /** Per-job proxy username; the proxy keys its allowlist and denial log on it. */
  proxyUser: string;
  containerId: string | null;
  /** How many proxy denials the daemon has already pulled for this job. */
  pulled?: number;
}

export interface Sandbox {
  ref: SandboxRef;
  /** Sends one op to the agent. Rejects with SandboxGone if the container dies, or AgentTimeout. */
  send(op: AgentOp, timeoutMs: number): Promise<AgentReply>;
  /** Denials the proxy recorded for this job since the last pull. */
  pullDenials(): Promise<Denial[]>;
  /** Current memory (MiB) and process count, if the driver can measure them. */
  stats(): Promise<{ memMb: number; pids: number } | null>;
  /** Resolves when the container process exits for any reason. */
  exited: Promise<void>;
}

export interface TeardownResult {
  containerRemoved: boolean;
  volumeRemoved: boolean;
  /** Denials not yet pulled, collected when the job is unregistered from the proxy. */
  remainingDenials: Denial[];
  detail: string | null;
}

export interface Driver {
  readonly name: "docker" | "fake";
  init(): Promise<void>;
  imageDigest(): string;
  start(spec: { jobId: string; allowedHosts: string[]; expiresAt: number }): Promise<Sandbox>;
  /** Stops the container immediately (cancel, deadline). Safe to call twice. */
  kill(ref: SandboxRef): Promise<void>;
  /** Removes container + volume + proxy registration and VERIFIES they are gone. */
  teardown(jobId: string, ref: SandboxRef | null): Promise<TeardownResult>;
  /** Removes labelled leftovers that don't belong to an active job. Returns what it removed and what it couldn't. */
  sweep(activeJobIds: ReadonlySet<string>): Promise<{ removed: string[]; failed: string[] }>;
  health(): Promise<{ ok: boolean; detail: string | null }>;
}

export class SandboxGone extends Error {
  override name = "SandboxGone";
}

export class AgentTimeout extends Error {
  override name = "AgentTimeout";
}
