/**
 * Runner daemon configuration. Holds no provider, inference or cloud keys:
 * only the token the control plane uses to call us, the approval-token key,
 * and TLS material.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface RunnerConfig {
  driver: "docker" | "fake";
  bindHost: string;
  port: number;
  sharedToken: string;
  approvalKey: string;
  tls: { cert: Buffer; key: Buffer } | null;
  stateDir: string;
  /** Test-only: hostnames the proxy maps to fixture containers. Never allowed in production. */
  testMode: boolean;
  testHosts: Record<string, string>;
  docker: {
    bin: string;
    browserImage: string;
    egressImage: string;
    jobsSubnet: string;
    proxyIp: string;
    outSubnet: string;
    controlPort: number;
    seccompProfile: string;
  };
  limits: {
    memoryMb: number;
    cpus: number;
    pids: number;
    tmpMb: number;
    byteCapMb: number;
    startTimeoutMs: number;
  };
  /** How long screenshots stay downloadable after a job is cleaned. */
  artifactTtlMs: number;
  sweepIntervalMs: number;
}

const PKG = resolve(import.meta.dirname, "..");

export function loadRunnerConfig(env: Record<string, string | undefined> = process.env): RunnerConfig {
  const production = env.NODE_ENV === "production";
  const driver = (env.RUNNER_DRIVER ?? "docker").trim();
  if (driver !== "docker" && driver !== "fake") throw new Error(`RUNNER_DRIVER must be docker or fake, got ${driver}`);

  const sharedToken = env.RUNNER_SHARED_TOKEN?.trim() ?? "";
  if (sharedToken.length < 32) throw new Error("RUNNER_SHARED_TOKEN must be set and at least 32 characters.");
  const approvalKey = env.RUNNER_APPROVAL_KEY?.trim() ?? "";
  if (approvalKey.length < 32) throw new Error("RUNNER_APPROVAL_KEY must be set and at least 32 characters.");
  if (approvalKey === sharedToken) throw new Error("RUNNER_APPROVAL_KEY must differ from RUNNER_SHARED_TOKEN.");

  const testMode = env.RUNNER_TEST_MODE === "1";
  if (testMode && production) throw new Error("RUNNER_TEST_MODE is refused when NODE_ENV=production.");
  if (production && driver === "fake") throw new Error("RUNNER_DRIVER=fake is refused when NODE_ENV=production.");

  let tls: RunnerConfig["tls"] = null;
  if (env.RUNNER_TLS_CERT && env.RUNNER_TLS_KEY) tls = { cert: readFileSync(env.RUNNER_TLS_CERT), key: readFileSync(env.RUNNER_TLS_KEY) };
  else if (production) throw new Error("RUNNER_TLS_CERT and RUNNER_TLS_KEY are required in production.");

  const bindHost = env.RUNNER_BIND_HOST?.trim() || "127.0.0.1";
  if (bindHost === "0.0.0.0" || bindHost === "::") throw new Error("Bind the runner to its private VPC address, not all interfaces.");

  return {
    driver,
    bindHost,
    port: Number(env.RUNNER_PORT) || 8443,
    sharedToken,
    approvalKey,
    tls,
    stateDir: resolve(env.RUNNER_STATE_DIR || resolve(PKG, ".runner-state")),
    testMode,
    testHosts: testMode ? JSON.parse(env.RUNNER_TEST_HOSTS || "{}") : {},
    docker: {
      bin: env.DOCKER_BIN || "docker",
      browserImage: env.RUNNER_BROWSER_IMAGE || "wallio-browser:0.1.0",
      egressImage: env.RUNNER_EGRESS_IMAGE || "wallio-egress:0.1.0",
      jobsSubnet: "172.30.0.0/24",
      proxyIp: "172.30.0.2",
      outSubnet: "172.31.0.0/24",
      controlPort: Number(env.RUNNER_PROXY_CONTROL_PORT) || 3129,
      seccompProfile: resolve(PKG, "image/seccomp-chromium.json"),
    },
    limits: {
      memoryMb: Number(env.RUNNER_JOB_MEMORY_MB) || 1536,
      cpus: Number(env.RUNNER_JOB_CPUS) || 1,
      pids: Number(env.RUNNER_JOB_PIDS) || 256,
      tmpMb: 256,
      byteCapMb: Number(env.RUNNER_JOB_BYTE_CAP_MB) || 50,
      startTimeoutMs: 20_000,
    },
    artifactTtlMs: 30 * 60_000,
    sweepIntervalMs: 30_000,
  };
}
