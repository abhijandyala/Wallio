/**
 * End-to-end: spawns the connector over stdio with the SDK's client, against a local Wallio API
 * (WALLIO_URL, default http://localhost:8787, mock mode). Skips when that API isn't reachable.
 * Uses a throwaway session file so it never touches ~/.config/wallio-mcp.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const API = process.env.WALLIO_TEST_URL ?? "http://localhost:8787";
const SERVER = fileURLToPath(new URL("../src/server.ts", import.meta.url));

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const up = await reachable();
if (!up) console.log(`# SKIP: the local Wallio API at ${API} isn't reachable. Start it (mock mode) to run these tests.`);

const text = (r: CallToolResult) => r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");

describe("wallio-mcp over stdio", { skip: !up && `local Wallio API at ${API} not reachable` }, () => {
  let client: Client;
  let dir: string;
  let sessionFile: string;

  const callTool = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "wallio-mcp-test-"));
    sessionFile = join(dir, "session.json");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...getDefaultEnvironment(), WALLIO_URL: API, WALLIO_SESSION_FILE: sessionFile },
      stderr: "pipe",
    });
    client = new Client({ name: "wallio-mcp-test", version: "0.0.0" });
    await client.connect(transport);
  });

  after(async () => {
    await client?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists the six tools and states the approval boundary", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["get_profile", "get_run", "get_wallet", "list_decisions", "search_catalog", "start_comparison"],
    );
    assert.match(tools.find((t) => t.name === "start_comparison")!.description!, /quota/);
    for (const t of tools.filter((t) => t.name !== "start_comparison")) assert.equal(t.annotations?.readOnlyHint, true, t.name);
    assert.match(client.getInstructions() ?? "", /only in the Wallio app/);
  });

  it("get_wallet joins tool names, shows unknown prices as Unknown, and uses the server summary", async () => {
    const r = await callTool("get_wallet");
    assert.ok(!r.isError, text(r));
    const s = r.structuredContent as {
      subscriptions: { toolId: string; toolName: string; price: { known: boolean }; priceText: string }[];
      summary: { knownMonthlyEquivalentMinor: number | null; unknownPriceCount: number };
    };
    assert.ok(s.subscriptions.length > 0);
    for (const row of s.subscriptions) {
      assert.notEqual(row.toolName, row.toolId, "tool name joined from catalog");
      if (!row.price.known) assert.match(row.priceText, /^Unknown/);
    }
    assert.equal(s.summary.unknownPriceCount, s.subscriptions.filter((x) => !x.price.known).length);
    assert.doesNotMatch(text(r), /\$0\.00/);
    assert.match(text(r), /Known monthly equivalent \(server\)/);
    // The session the API set is persisted, private to the user.
    const saved = JSON.parse(readFileSync(sessionFile, "utf8")) as { sessions: Record<string, string> };
    assert.ok(saved.sessions[new URL(API).origin]);
    assert.equal(statSync(sessionFile).mode & 0o777, 0o600);
  });

  it("get_profile marks stated vs inferred attributes", async () => {
    const r = await callTool("get_profile");
    assert.ok(!r.isError, text(r));
    const p = (r.structuredContent as { profile: { id: string; workflows: { id: string }[] } }).profile;
    assert.ok(p.id);
    assert.ok(p.workflows.some((w) => w.id === "wf_debugging"));
    assert.match(text(r), /stated by the person/);
    assert.match(text(r), /inferred from .+ confidence/);
  });

  it("list_decisions reads the queue", async () => {
    const r = await callTool("list_decisions");
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /Pending approvals: \d+/);
  });

  it("search_catalog filters by query", async () => {
    const all = await callTool("search_catalog");
    const zed = await callTool("search_catalog", { query: "zed" });
    const none = await callTool("search_catalog", { query: "no-such-tool-xyz" });
    const allTools = (all.structuredContent as { tools: unknown[] }).tools;
    const zedTools = (zed.structuredContent as { tools: { id: string }[] }).tools;
    assert.ok(allTools.length > zedTools.length);
    assert.ok(zedTools.some((t) => t.id === "tool_zed"));
    assert.equal((none.structuredContent as { tools: unknown[] }).tools.length, 0);
  });

  it("get_run maps API errors to tool errors", async () => {
    const r = await callTool("get_run", { runId: "run_does_not_exist" });
    assert.equal(r.isError, true);
    assert.match(text(r), /not found/i);
  });

  it("start_comparison runs to a recommendation with evidence ids", { timeout: 150_000 }, async () => {
    const started = await callTool("start_comparison");
    assert.ok(!started.isError, text(started));
    const runId = (started.structuredContent as { runId: string }).runId;
    assert.ok(runId);

    let last: CallToolResult | undefined;
    const deadline = Date.now() + 140_000;
    while (Date.now() < deadline) {
      last = await callTool("get_run", { runId });
      assert.ok(!last.isError, text(last));
      if ((last.structuredContent as { finished: boolean }).finished) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    assert.ok(last);
    const s = last.structuredContent as {
      finished: boolean;
      run: { outcome: string };
      recommendation: { action: string; statements: { evidenceIds: string[] }[] } | null;
    };
    assert.equal(s.finished, true, `run did not finish: ${text(last)}`);
    assert.ok(["succeeded", "partial"].includes(s.run.outcome), text(last));
    assert.ok(s.recommendation, "a recommendation is attached");
    assert.ok(s.recommendation.action);
    assert.ok(s.recommendation.statements.length > 0);
    assert.ok(s.recommendation.statements.some((st) => st.evidenceIds.length > 0), "statements cite evidence");
    assert.match(text(last), /Action: /);
  });
});
