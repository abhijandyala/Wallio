# Wallio on Railway

Railway hosts the **web app only** (`web/`, Next.js). The API, Postgres and the browser runner stay on Vultr. The runner needs its own Docker host, and the hackathon wants the backend on Vultr. The web app proxies `/api/*` to the Vultr API (`WALLIO_API_ORIGIN`), so visitors only ever talk to the Railway site, and the guest cookie stays first-party.

`railway.ts` is the service definition (Railway Infrastructure as Code). It is a named partial (`web`), so it manages the `web` service and leaves anything else in the project alone.

## Deploy with the CLI

Needs the Railway CLI, and Railway's GitHub app with access to `abhijandyala/Wallio` (the repo is private).

```bash
railway login
cd .railway && npm install && cd ..
railway link            # pick the Wallio project and the production environment
railway config plan     # expect: + Create service web
railway config apply
railway domain --service web   # a public *.up.railway.app address
```

## Or in the dashboard

1. New → GitHub Repo → `abhijandyala/Wallio`, branch `main`.
2. Settings → Source → Root Directory: `web`. Watch paths: `/web/**`.
3. Settings → Deploy → Healthcheck Path: `/`.
4. Variables: `WALLIO_API_ORIGIN=https://149-28-76-16.sslip.io`, `NEXT_TELEMETRY_DISABLED=1`.
5. Settings → Networking → Generate Domain.

Railpack does the rest: it reads Node from `engines` in `web/package.json`, then runs `npm ci`, `npm run build` and `npm start`. Next listens on Railway's `$PORT`. Don't set `NODE_ENV=production` as a variable; `npm ci` would then skip the build tools.

## Things to know

- **Shared rate limits.** The API counts guests and runs per client IP, and it only trusts the address its own Caddy sees. Every visitor who comes through Railway arrives from Railway's address, so they share one budget (`GUESTS_PER_HOUR_PER_IP`, 20 an hour on prod). For a demo with many visitors, raise it on the API, or have the API trust a client-IP header that only this proxy can set.
- **Writes are same-site only.** The proxy refuses writes whose `Origin` isn't this site, using Railway's `X-Forwarded-Host`. It then presents the API's own origin, so the API needs no change.
- **No secrets.** The web app needs none. `GITHUB_TOKEN` is optional (it raises GitHub's rate limit for the import on My AI).
