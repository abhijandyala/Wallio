# Wallio backend: how the agent is kept in bounds

Companion to `ARCHITECTURE.md`. This covers the parts of the API that make the agent safe to let loose: research that can't be steered by page text, scoring that the model can't bend, the approval gate, and the containment run. All diagrams render on GitHub.

## 1. A comparison, inside the API

```mermaid
flowchart TD
  Q["POST /api/comparisons<br/>(idempotent, spend reserved, quotas)"] --> W["Worker claims the run<br/>lease + hard deadline outside the executor"]
  W --> P["Plan (Vultr model)<br/>sees tool names, profile, allowed URLs<br/>never page content"]
  P --> POL{"API policy<br/>https · exact host + path · budgets"}
  POL -->|refused| D1["policy_denied event"]
  POL -->|allowed| J1["Runner job per tool<br/>allowlist = that tool's hosts only"]
  J1 --> E["Evidence: screenshot + text hash<br/>stored before any model reads it"]
  E --> X["Extract (Vultr model)<br/>page text as delimited untrusted data<br/>every finding must quote the page"]
  X --> G{"Quote found<br/>verbatim?"}
  G -->|no| D2["finding dropped + warning"]
  G -->|yes| K["Knowledge: known / missing / needs testing"]
  K --> T["Owned test job (eval host only)<br/>Vultr model fixes a sample bug<br/>page runs it under a no-network CSP"]
  T --> S["Score v1: hard constraints → weighted ranges<br/>unknown stays unknown"]
  S --> R["Rules pick the action<br/>model only writes cited sentences<br/>validator rejects uncited claims or new numbers"]
  R --> C["Recommendation + result_ready"]
  C --> CL["Cleanup: every runner job verified removed"]
```

Each runner job is opened only after the previous one is finished and its removal verified. Every job id is written to the run before the job is created, so cleanup can always find it, even after a crash.

## 2. The approval gate (synthetic trial request)

```mermaid
sequenceDiagram
  autonumber
  participant U as User (web app)
  participant A as Wallio API
  participant DB as Postgres
  participant R as Runner (isolated browser)
  participant F as forms.[domain] (Wallio's own form)
  A->>R: job "form" (allowlist: forms host only)
  R->>F: open /trial/[token]
  A->>R: fill fixed synthetic values (only allowed on this host)
  R-->>A: page fingerprint (URL + structure + current field values), screenshot
  A->>DB: intent {fields, target, element, fingerprint, screenshot, expiry, nonce}<br/>hash = sha256(canonical JSON)
  A-->>U: approval_required (run is AWAITING_APPROVAL)
  U->>A: POST /api/approvals/:id/decision {approve, intentHash}
  A->>DB: owner? unexpired? pending? run waiting? hash matches? → approved
  A->>R: inspect again
  alt page, field, button or target changed
    A->>DB: invalidated
    A-->>U: approval_resolved: invalidated, then a NEW intent
  else unchanged
    A->>DB: consume (approved → consumed, exactly one winner)
    A->>R: click submit + HMAC token bound to job, action, element, fingerprint
    R->>R: runner verifies token itself, single use
    R->>F: POST (one submission per token, enforced by the form too)
    A-->>U: action_result: submitted (never retried)
  end
```

Who can change an approval:

| Transition | Only by |
|---|---|
| pending → approved / declined | The user's decision call (checked: owner, expiry, unused, run waiting, hash) |
| approved → consumed | The worker, once, immediately before dispatch |
| pending/approved → expired / invalidated | The worker (time, page change) or the run ending |
| anything from a final state | Nobody: a database trigger refuses it, and keeps the intent itself immutable |

The model is never part of this path. The intent's values are fixed synthetic values from code, not model output.

## 3. Containment run (Blast Radius Zero)

```mermaid
flowchart LR
  H["hostile.[domain]<br/>prompt injection · form posting to a private IP<br/>links to cloud metadata · background requests on load"]
  subgraph Runner VM
    B["Job container<br/>no keys · read-only · CPU/mem/pid limits"] --> PX["Egress proxy<br/>job's host on 443 only<br/>private, link-local, metadata denied"]
  end
  H --> B
  PX -. denied .-> S["Sentinel on the control VM's private IP<br/>(10.5.96.3:9099, VPC-only)"]
  A["Wallio API"] -->|"1. inspect"| B
  A -->|"2. policy check on every control<br/>(never clicks on this page)"| A
  A -->|"3. sentinel count before / after"| S
  A -->|"4. finish → container + volume verified removed"| B
```

The run passes only if all four hold:
- the proxy's denials are logged;
- every off-host control is refused by policy before dispatch;
- the sentinel's count is unchanged;
- the cleanup is verified.

A sentinel hit fails the run loudly. The page's text is stored as untrusted evidence and never followed.

## 4. Where state lives

| Table | Holds | Notes |
|---|---|---|
| `workspaces`, `sessions` | Guest workspace per visitor | Session token stored as a hash only |
| `profile_versions`, `subscriptions` | What the user told us | Versioned; recommendations pin the version they used |
| `comparisons` | The idempotent request for every run kind | Same key + same body → same run |
| `runs`, `run_events` | Lifecycle, outcome, spend, runner job ids, correlation id; SSE event log | Status and outcome are separate, so a cleanup error can't hide a finished result |
| `evidence`, `evidence_screenshots` | URL, capture time, content hash, screenshot bytes, excerpt, limitation | Screenshots only served after an ownership check |
| `recommendations`, `decisions` | Contract-validated result; the user's choice with an evidence snapshot | |
| `approvals`, `form_sessions`, `eval_sessions` | Intents and their state; one-submission form tokens; owned-test tokens | Tokens stored as hashes only |
| `inference_usage`, `audit_events` | Per-call model, tokens, latency, cost; who did what | Append-only audit for the app role |

Every tenant table carries `tenant_id` with forced row-level security (`NULLIF(current_setting('app.tenant_id', true), '')::uuid`). The app connects as `wallio_app`, which is not a superuser and has no RLS bypass. Cross-tenant worker reads go through a few narrow `SECURITY DEFINER` functions.
