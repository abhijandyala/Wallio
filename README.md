# Wallio

A personal AI manager: it finds, compares and tests AI tools for your work, then explains what to keep, try, replace or review, with receipts. Built for the Vultr Agent Rush hackathon (Blast Radius Zero track).

## Repository layout

| Path | What |
|---|---|
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

## License

MIT
