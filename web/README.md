# Wallio web

The product interface: Home, My AI, Discover, Compare, Decisions and Settings. Next.js (App Router), Tailwind v4, shadcn on Base UI, Motion.

Design rules, palette, type and the component kit live in [`docs/DESIGN.md`](../docs/DESIGN.md).

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
