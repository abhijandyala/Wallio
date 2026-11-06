/**
 * Docker driver: one short-lived, locked-down Chromium container per job
 * (PRD §13–14). The daemon talks to Docker through the CLI with argument
 * arrays (no shell). The Docker socket is never mounted into any container.
 *
 * Network layout:
 *   wallio-jobs        --internal, no route anywhere. Job containers + proxy.
 *   wallio-egress-out  normal bridge. Proxy only (plus test fixtures in test mode).
 */
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { RunnerConfig } from "../config.ts";
import { EgressControl } from "../egress/control.ts";
import { AgentChannel } from "./channel.ts";
import type { Denial, Driver, Sandbox, SandboxRef, TeardownResult } from "../drivers/types.ts";

export const JOBS_NET = "wallio-jobs";
export const OUT_NET = "wallio-egress-out";
export const PROXY_NAME = "wallio-egress";
const LABEL_JOB = "wallio.job";
const LABEL_EXPIRES = "wallio.expires";
const LABEL_INFRA = "wallio.infra";

export interface DockerResult { code: number; stdout: string; stderr: string }

export function docker(bin: string, args: string[], timeoutMs = 30_000): Promise<DockerResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0;
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

const safeName = (jobId: string) => jobId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 40);
const noSuch = (r: DockerResult) => r.code !== 0 && /no such/i.test(r.stderr);

export class DockerDriver implements Driver {
  readonly name = "docker" as const;
  private cfg: RunnerConfig;
  private digest = "";
  private control: EgressControl;
  private controlToken = randomBytes(32).toString("base64url");

  constructor(cfg: RunnerConfig) {
    this.cfg = cfg;
    this.control = new EgressControl(`http://127.0.0.1:${cfg.docker.controlPort}`, this.controlToken);
  }

  private run(args: string[], timeoutMs?: number) {
    return docker(this.cfg.docker.bin, args, timeoutMs);
  }

  imageDigest(): string {
    return this.digest;
  }

  async init(): Promise<void> {
    const v = await this.run(["version", "--format", "{{.Server.Version}}"]);
    if (v.code !== 0) throw new Error(`Docker is not reachable: ${v.stderr.trim()}`);

    for (const image of [this.cfg.docker.browserImage, this.cfg.docker.egressImage]) {
      const r = await this.run(["image", "inspect", "--format", "{{.Id}}", image]);
      if (r.code !== 0) throw new Error(`Image ${image} is missing. Build it with: npm run images -w @wallio/runner`);
      if (image === this.cfg.docker.browserImage) this.digest = r.stdout.trim();
    }

    await this.ensureNetwork(JOBS_NET, this.cfg.docker.jobsSubnet, true);
    await this.ensureNetwork(OUT_NET, this.cfg.docker.outSubnet, false);
    await this.startProxy();
  }

  private async ensureNetwork(name: string, subnet: string, internal: boolean) {
    const r = await this.run(["network", "inspect", "--format", "{{.Internal}} {{range .IPAM.Config}}{{.Subnet}}{{end}}", name]);
    if (r.code === 0) {
      const [isInternal, sn] = r.stdout.trim().split(" ");
      if (String(internal) === isInternal && sn === subnet) return;
      throw new Error(`Docker network ${name} exists with the wrong settings (internal=${isInternal}, subnet=${sn}). Remove it and restart.`);
    }
    const args = ["network", "create", "--driver", "bridge", "--subnet", subnet, "--label", `${LABEL_INFRA}=1`];
    if (internal) args.push("--internal", "-o", "com.docker.network.bridge.enable_ip_masquerade=false");
    const c = await this.run([...args, name]);
    if (c.code !== 0) throw new Error(`Could not create network ${name}: ${c.stderr.trim()}`);
  }

  /** (Re)starts the egress proxy with a fresh control token for this daemon process. */
  private async startProxy() {
    await this.run(["rm", "-f", PROXY_NAME]);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PROXY_JOBS_IP: this.cfg.docker.proxyIp,
      PROXY_CONTROL_TOKEN: this.controlToken,
      PROXY_TEST_MODE: this.cfg.testMode ? "1" : "0",
      PROXY_TEST_HOSTS: JSON.stringify(this.cfg.testHosts),
    };
    const args = [
      "run", "-d", "--name", PROXY_NAME, "--label", `${LABEL_INFRA}=1`,
      "--network", OUT_NET, "-p", `127.0.0.1:${this.cfg.docker.controlPort}:3129`,
      "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", "node", "--memory", "256m", "--pids-limit", "64", "--restart", "unless-stopped",
      "-e", "PROXY_JOBS_IP", "-e", "PROXY_CONTROL_TOKEN", "-e", "PROXY_TEST_MODE", "-e", "PROXY_TEST_HOSTS",
      this.cfg.docker.egressImage,
    ];
    const r = await new Promise<DockerResult>((resolve) =>
      execFile(this.cfg.docker.bin, args, { env, timeout: 30_000 }, (err, stdout, stderr) => resolve({ code: err ? 1 : 0, stdout, stderr })),
    );
    if (r.code !== 0) throw new Error(`Could not start the egress proxy: ${r.stderr.trim()}`);
    const c = await this.run(["network", "connect", "--ip", this.cfg.docker.proxyIp, JOBS_NET, PROXY_NAME]);
    if (c.code !== 0) throw new Error(`Could not attach the egress proxy to ${JOBS_NET}: ${c.stderr.trim()}`);
    for (let i = 0; i < 40; i++) {
      if (await this.control.healthy()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("The egress proxy did not become healthy.");
  }

  async start(spec: { jobId: string; allowedHosts: string[]; expiresAt: number }): Promise<Sandbox> {
    const name = `wallio-job-${safeName(spec.jobId)}-${randomBytes(3).toString("hex")}`;
    const proxyUser = `j${randomBytes(12).toString("hex")}`;
    const proxyPass = randomBytes(24).toString("base64url");
    const labels = ["--label", `${LABEL_JOB}=${spec.jobId}`, "--label", `${LABEL_EXPIRES}=${Math.ceil(spec.expiresAt / 1000)}`];
    const L = this.cfg.limits;

    await this.control.register(proxyUser, { jobId: spec.jobId, pass: proxyPass, allowedHosts: spec.allowedHosts, byteCap: L.byteCapMb * 1024 * 1024 });

    const vol = await this.run([
      "volume", "create", "--driver", "local", "--opt", "type=tmpfs", "--opt", "device=tmpfs",
      "--opt", `o=size=${L.tmpMb}m,uid=1001,gid=1001,mode=0700`, ...labels, name,
    ]);
    if (vol.code !== 0) throw new Error(`Could not create the job volume: ${vol.stderr.trim()}`);

    const args = [
      "run", "-i", "--init", "--name", name, ...labels,
      "--network", JOBS_NET, "--dns", "127.0.0.1",
      "--user", "pwuser", "--read-only",
      "--tmpfs", `/tmp:rw,nosuid,nodev,size=${L.tmpMb}m,mode=1777`,
      "--mount", `type=volume,src=${name},dst=/home/pwuser/work`,
      "--workdir", "/home/pwuser/work", "-e", "HOME=/home/pwuser/work",
      "--memory", `${L.memoryMb}m`, "--memory-swap", `${L.memoryMb}m`, "--cpus", String(L.cpus),
      "--pids-limit", String(L.pids), "--ulimit", "nofile=1024:1024",
      // Chromium's own sandbox needs chroot inside its user namespace. pwuser never holds the
      // capability (CapEff is 0); keeping it in the bounding set only lets seccomp permit the syscall.
      "--cap-drop", "ALL", "--cap-add", "SYS_CHROOT",
      "--security-opt", "no-new-privileges", "--security-opt", `seccomp=${this.cfg.docker.seccompProfile}`,
      // Values come from the spawn env so they never appear in the host process list.
      "-e", "WALLIO_PROXY_SERVER", "-e", "WALLIO_PROXY_USER", "-e", "WALLIO_PROXY_PASS", "-e", "WALLIO_TEST_MODE",
      this.cfg.docker.browserImage,
    ];
    const child = spawn(this.cfg.docker.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOCKER_HOST: process.env.DOCKER_HOST,
        WALLIO_PROXY_SERVER: `http://${this.cfg.docker.proxyIp}:3128`,
        WALLIO_PROXY_USER: proxyUser,
        WALLIO_PROXY_PASS: proxyPass,
        WALLIO_TEST_MODE: this.cfg.testMode ? "1" : "0",
      } as NodeJS.ProcessEnv,
    });
    const channel = new AgentChannel(child);
    const ref: SandboxRef = { name, proxyUser, containerId: null };

    const hello = await Promise.race([
      channel.hello,
      new Promise<{ hello: "failed"; message: string }>((r) => setTimeout(() => r({ hello: "failed", message: "The browser did not start in time." }), L.startTimeoutMs)),
    ]);
    if (hello.hello !== "ready") {
      child.kill("SIGKILL");
      throw Object.assign(new Error(hello.message), { ref });
    }
    const id = await this.run(["container", "inspect", "--format", "{{.Id}}", name]);
    ref.containerId = id.code === 0 ? id.stdout.trim().slice(0, 12) : null;

    let since = 0;
    const control = this.control;
    const run = this.run.bind(this);
    return {
      ref,
      exited: channel.exited,
      send: (op, timeoutMs) => channel.send(op, timeoutMs),
      async pullDenials(): Promise<Denial[]> {
        const r = await control.denials(proxyUser, since).catch(() => ({ denials: [], next: since }));
        since = r.next;
        return r.denials;
      },
      async stats() {
        const r = await run(["stats", "--no-stream", "--format", "{{.MemUsage}}|{{.PIDs}}", name], 10_000);
        if (r.code !== 0) return null;
        const [mem, pids] = r.stdout.trim().split("|");
        const m = /([\d.]+)\s*([KMG]i?B)/.exec(mem ?? "");
        if (!m) return null;
        const mult: Record<string, number> = { KiB: 1 / 1024, KB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 };
        return { memMb: Math.round(Number(m[1]) * (mult[m[2]!] ?? 1)), pids: Number(pids) || 0 };
      },
    };
  }

  async kill(ref: SandboxRef): Promise<void> {
    await this.run(["kill", ref.name], 15_000);
  }

  async teardown(jobId: string, ref: SandboxRef | null): Promise<TeardownResult> {
    let remainingDenials: Denial[] = [];
    if (ref) {
      const u = await this.control.unregister(ref.proxyUser).catch(() => null);
      remainingDenials = (u?.denials ?? []).slice(ref.pulled ?? 0);
    }
    // Remove by label as well as by name, so nothing tagged with this job survives.
    const names = new Set<string>(ref ? [ref.name] : []);
    const listed = await this.run(["ps", "-a", "--filter", `label=${LABEL_JOB}=${jobId}`, "--format", "{{.Names}}"]);
    listed.stdout.split("\n").filter(Boolean).forEach((n) => names.add(n.trim()));
    const vols = new Set<string>(ref ? [ref.name] : []);
    const lv = await this.run(["volume", "ls", "--filter", `label=${LABEL_JOB}=${jobId}`, "--format", "{{.Name}}"]);
    lv.stdout.split("\n").filter(Boolean).forEach((n) => vols.add(n.trim()));

    for (const n of names) await this.run(["rm", "-f", "-v", n], 30_000);
    for (const v of vols) await this.run(["volume", "rm", "-f", v], 30_000);

    // Verify absence, by name and by label (PRD §15: report absence before CLEANED).
    let containerRemoved = true;
    for (const n of names) if (!noSuch(await this.run(["container", "inspect", n]))) containerRemoved = false;
    if ((await this.run(["ps", "-a", "-q", "--filter", `label=${LABEL_JOB}=${jobId}`])).stdout.trim()) containerRemoved = false;
    let volumeRemoved = true;
    for (const v of vols) if (!noSuch(await this.run(["volume", "inspect", v]))) volumeRemoved = false;
    if ((await this.run(["volume", "ls", "-q", "--filter", `label=${LABEL_JOB}=${jobId}`])).stdout.trim()) volumeRemoved = false;

    return {
      containerRemoved,
      volumeRemoved,
      remainingDenials,
      detail: containerRemoved && volumeRemoved ? null : `Still present after removal: ${!containerRemoved ? "container " : ""}${!volumeRemoved ? "volume" : ""}`.trim(),
    };
  }

  async sweep(active: ReadonlySet<string>): Promise<{ removed: string[]; failed: string[] }> {
    const removed: string[] = [];
    const failed: string[] = [];
    const now = Date.now() / 1000;
    const stale = (job: string, exp: string) => !active.has(job) || (Number(exp) > 0 && Number(exp) < now);

    const cs = await this.run(["ps", "-a", "--filter", `label=${LABEL_JOB}`, "--format", `{{.Names}}\t{{.Label "${LABEL_JOB}"}}\t{{.Label "${LABEL_EXPIRES}"}}`]);
    for (const line of cs.stdout.split("\n").filter(Boolean)) {
      const [n, job, exp] = line.split("\t") as [string, string, string];
      if (!stale(job, exp)) continue;
      await this.run(["rm", "-f", "-v", n]);
      (noSuch(await this.run(["container", "inspect", n])) ? removed : failed).push(`container ${n}`);
    }
    const vs = await this.run(["volume", "ls", "--filter", `label=${LABEL_JOB}`, "--format", `{{.Name}}\t{{.Label "${LABEL_JOB}"}}\t{{.Label "${LABEL_EXPIRES}"}}`]);
    for (const line of vs.stdout.split("\n").filter(Boolean)) {
      const [n, job, exp] = line.split("\t") as [string, string, string];
      if (!stale(job, exp)) continue;
      await this.run(["volume", "rm", "-f", n]);
      (noSuch(await this.run(["volume", "inspect", n])) ? removed : failed).push(`volume ${n}`);
    }
    return { removed, failed };
  }

  async health(): Promise<{ ok: boolean; detail: string | null }> {
    if (!(await this.control.healthy())) return { ok: false, detail: "egress proxy is not answering" };
    return { ok: true, detail: null };
  }
}
