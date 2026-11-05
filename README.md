# Wallio

A personal AI manager: it finds, compares and tests AI tools for your work, then explains what to keep, try, replace or review, with receipts. Built for the Vultr Agent Rush hackathon (Blast Radius Zero track).

## Repository layout

| Path | What |
|---|---|
| `packages/api` | Backend API: Postgres schema with row-level security, guest sessions, inventory, profile, comparisons, run events (SSE), Vultr inference gateway |
| `packages/contracts` | Shared schemas between the UI, the backend API and the browser runner (zod + generated JSON Schema + fixtures) |
| `docs/GOLDEN_PATH.md` | The one end-to-end journey the demo must complete |
| `docs/CONTRACTS.md` | Endpoint list, runner step protocol and sign-off checklist |

## Working with the contracts

Needs Node 22.18 or later (runs TypeScript directly).

```bash
npm install
npm run contracts:test     # validate fixtures and guardrails
npm run contracts:schema   # regenerate JSON Schema files
```

## Running the API locally

Needs Node 22.18+ and PostgreSQL 16.

```bash
cp .env.example .env          # then fill in VULTR_INFERENCE_API_KEY
npm install
npm run db:setup              # creates the wallio_app role, migrates, seeds the catalog
npm run api:dev               # http://localhost:8787, RUN_MODE=mock by default
npm run api:test              # needs the wallio_test database (see .env.example)
```

`RUN_MODE=mock` plays a scripted comparison (clearly labelled as sample data) so the UI can be built before the live runner exists.

**For the UI:** proxy `/api` to `http://localhost:8787` from your dev server so the session cookie is same-origin. Each new browser gets its own guest workspace with demo data. Run events stream over SSE from `GET /api/runs/:id/events`: events have no `event:` name, so use `EventSource.onmessage` and read `type` from the JSON.

## License

MIT
