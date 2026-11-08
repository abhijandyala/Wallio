# @wallio/mcp: the Wallio connector

An MCP server (stdio) that lets an AI assistant such as Claude Desktop, Claude Code or Cursor read a person's Wallio wallet: their AI subscriptions, their profile, their recommendations and decisions. It can also start the one comparison run that works end to end today.

It talks to the Wallio API over HTTPS as a guest session, the same way the web app does.

## Tools

| Tool | What it does | Changes anything? |
| --- | --- | --- |
| `get_wallet` | Subscriptions with tool name, plan, price, cadence, seats and renewal date, plus the server's summary (known monthly equivalent, number of unknown prices, upcoming renewals). Unknown prices show as "Unknown", never $0. | No |
| `get_profile` | Role, workflows, budget, preferences, required integrations, and attributes marked as stated by the person or inferred by Wallio (with source and confidence). | No |
| `list_decisions` | Pending approvals, open recommendations, deferred items and decision history. | No |
| `search_catalog` | Wallio's catalog of AI tools, optionally filtered by a query (name, provider, category or id). | No |
| `start_comparison` | Starts a research run: GitHub Copilot vs Zed on the `wf_debugging` workflow, spend cap 50 cents. Uses one run from the person's daily quota. Returns a `runId`. If a run is already going, returns that run instead. | Starts one run |
| `get_run` | Status, stage and outcome of a run. Once there's a recommendation, also returns its action, headline, confidence, and statements with their evidence ids. | No |

Every tool returns a short text answer and the same data as `structuredContent`. API errors come back as MCP tool errors (`isError: true`) carrying the API's own message, for example `validation_failed` when the profile has no `wf_debugging` workflow.

## Safety boundary

- Only reads, plus starting a comparison. No tool can approve an action, submit a form, record a decision, cancel a subscription or spend money.
- Approvals and decisions happen only in the Wallio app, by the person. The server instructions tell the assistant this, and `get_run` and `list_decisions` say so whenever something is waiting for approval.
- Totals come from the server's summary. The connector never adds up prices.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `WALLIO_URL` | `https://149-28-76-16.sslip.io` | Wallio API origin. Must be `https`; `http` is allowed only for `localhost`, `127.0.0.1` and `[::1]`. |
| `WALLIO_SESSION` | unset | An existing `wallio_sid` cookie value, to use the same guest wallet as your browser. |
| `WALLIO_SESSION_FILE` | `~/.config/wallio-mcp/session.json` | Where the session is saved when `WALLIO_SESSION` is unset. Honors `XDG_CONFIG_HOME`. |

When `WALLIO_SESSION` is unset, the first call creates a new guest wallet and saves its session in the session file (mode 600, one entry per API origin), so the connector keeps the same wallet across restarts. If the API replaces an expired session, the new one is saved. The session value is never logged.

**`WALLIO_SESSION` is a secret.** Whoever holds it can read and use that guest wallet, the same as a password or bearer token. Don't commit it or paste it into shared config. To find it, open the Wallio app, then your browser's developer tools, then Application, Cookies, `wallio_sid`.

Requires Node 22.18 or newer (it runs the TypeScript source directly). Run `npm install` at the repo root first.

## Add it to your assistant

Replace `/absolute/path/to/Wallio` with where you cloned the repo.

### Claude Desktop

In `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wallio": {
      "command": "node",
      "args": ["/absolute/path/to/Wallio/packages/mcp/src/server.ts"],
      "env": {
        "WALLIO_URL": "https://149-28-76-16.sslip.io"
      }
    }
  }
}
```

Restart Claude Desktop afterwards. If it can't find `node`, use the full path from `which node`.

### Claude Code

```sh
claude mcp add wallio -- node /absolute/path/to/Wallio/packages/mcp/src/server.ts
```

To share your browser's wallet: `claude mcp add --env WALLIO_SESSION=<value> wallio -- node /absolute/path/to/Wallio/packages/mcp/src/server.ts`

### Cursor

In `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "wallio": {
      "command": "node",
      "args": ["/absolute/path/to/Wallio/packages/mcp/src/server.ts"],
      "env": {
        "WALLIO_URL": "https://149-28-76-16.sslip.io"
      }
    }
  }
}
```

## Development

```sh
npm start -w @wallio/mcp       # run the server on stdio
npm test -w @wallio/mcp        # end to end against a local API at http://localhost:8787 (skips if it isn't running)
npm run typecheck -w @wallio/mcp
```

The test spawns the server with the SDK's stdio client, uses a throwaway session file, and runs a full mock-mode comparison. Point it at another local API with `WALLIO_TEST_URL`.

Built on `@modelcontextprotocol/sdk` 1.32.2 (the v1 line).
