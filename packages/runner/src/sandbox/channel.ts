/**
 * stdio JSON-lines channel to the agent in a job container (`docker run -i`).
 * Replies are matched by id. A dead process rejects every pending request.
 */
import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { AGENT_CAPS, type AgentHello, type AgentOp, type AgentReply } from "../../agent/protocol.ts";
import { AgentTimeout, SandboxGone } from "../drivers/types.ts";

export class AgentChannel {
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: AgentReply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private stderrTail: string[] = [];
  private dead = false;
  readonly hello: Promise<AgentHello>;
  readonly exited: Promise<void>;
  private child: ChildProcess;

  constructor(child: ChildProcess) {
    this.child = child;
    let helloResolve!: (h: AgentHello) => void;
    this.hello = new Promise((r) => (helloResolve = r));
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (line.length > AGENT_CAPS.maxLineBytes) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg && typeof msg.hello === "string") return helloResolve(msg as AgentHello);
      const p = typeof msg?.id === "number" ? this.pending.get(msg.id) : undefined;
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.resolve(msg as AgentReply);
    });
    child.stderr?.on("data", (d: Buffer) => {
      this.stderrTail.push(...d.toString("utf8").split("\n").filter(Boolean));
      if (this.stderrTail.length > 40) this.stderrTail.splice(0, this.stderrTail.length - 40);
    });
    this.exited = new Promise((resolve) => {
      child.once("exit", () => {
        this.dead = true;
        helloResolve({ hello: "failed", message: `container exited before the browser was ready: ${this.lastStderr()}` });
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new SandboxGone("The browser container exited."));
          this.pending.delete(id);
        }
        resolve();
      });
    });
  }

  send(op: AgentOp, timeoutMs: number): Promise<AgentReply> {
    if (this.dead) return Promise.reject(new SandboxGone("The browser container is not running."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AgentTimeout(`No answer from the browser within ${Math.round(timeoutMs / 1000)} s.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin!.write(JSON.stringify({ ...op, id }) + "\n");
    });
  }

  lastStderr(): string {
    return this.stderrTail.slice(-3).join(" | ").slice(0, 400);
  }
}
