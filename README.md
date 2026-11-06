# Wallio

A personal AI manager: it finds, compares and tests AI tools for your work, then explains what to keep, try, replace or review, with receipts. Built for the Vultr Agent Rush hackathon (Blast Radius Zero track).

## Repository layout

| Path | What |
|---|---|
| `web` | Product interface (Next.js). `/` is the landing page and the app is at `/home`. See `web/README.md`; deploy files in `web/deploy/` |
| `packages/contracts` | Shared schemas between the UI, the backend API and the browser runner (zod + generated JSON Schema + fixtures) |
| `docs/GOLDEN_PATH.md` | The one end-to-end journey the demo must complete |
| `docs/CONTRACTS.md` | Endpoint list, runner step protocol and sign-off checklist |
| `docs/DESIGN.md` | UI design system: rules, palette, type, spacing and the component kit |
| `docs/ARCHITECTURE.md` | How a run flows across the web app, the API on Vultr, Vultr Serverless Inference and the browser runner |

## Working with the contracts

Needs Node 22.18 or later (runs TypeScript directly).

```bash
npm install
npm run contracts:test     # validate fixtures and guardrails
npm run contracts:schema   # regenerate JSON Schema files
```

## License

MIT
