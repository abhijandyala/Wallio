# Wallio web

The product interface: a landing page at `/`, then the app: Home (`/home`), My AI, Discover, Compare, Decisions and Settings. Next.js (App Router), Tailwind v4, shadcn on Base UI, Motion.

Design rules, palette, type and the component kit live in [`docs/DESIGN.md`](../docs/DESIGN.md).
How the web app fits with the API, Vultr inference and the browser runner: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

Pages outside the app rail: `/` (landing), `/start` (first-run setup), `/privacy`, `/terms`. The app lives under `src/app/(app)/`.

## First run (`/start`)

The landing page's "Open the app" leads to `/start`. It covers PRD F02 and Flow A. There are two ways in:

- **Your own setup** (about 3 minutes, five steps):
  1. Your role and up to three main tasks.
  2. The tools you use, from the API's catalog, with plan, price and billing. A blank price stays unknown.
  3. Monthly budget, where tools may run your code, how sensitive your code is, and how open you are to switching.
  4. An editable summary.
  5. Your first decision.
- **The sample developer** (about 1 minute): the seeded profile, with each inferred fact kept or removed.

What it saves and where:

- It saves through the same endpoints My AI uses: `POST /api/inventory`, `PATCH /api/inventory/:id` (which sets the sample tools aside as archived, never deleted) and `POST /api/profile/versions`.
- The first decision is the golden-path comparison (`wf_debugging`, Copilot vs Zed). That's why debugging is offered back if it isn't one of the person's tasks. The decision step hands off to `/compare?live=1`.
- A browser that finished setup goes straight to Home. To run setup again, use Settings → "Set up again" (`/start?again=1`), which loads the current answers so saving edits them rather than adding copies. Settings → Reset demo also clears the flag.

To run against a local API instead of the deployed one, put `WALLIO_API_ORIGIN=http://localhost:8787` in `web/.env.local`, and start the API with `APP_ORIGIN=http://localhost:8787`. The proxy presents itself to the API with that origin.

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Data

Every screen currently renders sample data from `src/mocks/*`, shaped by `src/lib/types.ts`. Each mock and call site is marked `TODO(api)` with the endpoint it will use. The UI only displays backend results and collects choices; totals, rankings, scores, run state and approvals come from the API.

Before wiring the API, reconcile `src/lib/types.ts` with the shared contracts in `packages/contracts/src/api.ts`.

## Demo switches (sample data only)

- `/compare?simulate=partial|failed|timed_out|reconnecting|cleanup_failed` plays a comparison that ends in that state.
- Compare's Recent list opens a saved report for each outcome.
- Compare → "Run the containment test" plays the owned hostile-page run.

## Deploying

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md): a Docker image or a systemd unit running `next start`, behind the same Caddy as the API.
