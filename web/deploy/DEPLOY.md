# Deploying the web app

The web app runs next to the API on the same Vultr control VM, behind the same Caddy. Visitors see one origin: Caddy sends `/api/*` to the API (127.0.0.1:8787) and everything else to Next.js (127.0.0.1:3000). Same origin keeps the guest session cookie (`wallio_sid`) first-party and passes the API's origin check.

None of this has been run against the live server yet. Check with Anish before changing the control VM.

## Option A: systemd on the control VM (matches the API)

1. Ship the repo to `/opt/wallio/current` the way `deploy/deploy.sh` does for the API.
2. Build on the server, as the `wallio` user:
   ```bash
   cd /opt/wallio/current/web
   npm ci
   npm run build
   ```
3. Install and start the unit:
   ```bash
   sudo cp web/deploy/wallio-web.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now wallio-web
   curl -s 127.0.0.1:3000 | head -c 200
   ```
4. Swap the main-domain block in `/etc/caddy/Caddyfile` for `web/deploy/Caddyfile.web` (replace `__WALLIO_DOMAIN__`), keep the `eval.`, `forms.` and `hostile.` blocks, then `sudo systemctl reload caddy`.
5. Check: `https://<domain>/` shows the landing page, `https://<domain>/home` the app, and `https://<domain>/api/health` the API.

## Option B: Docker

```bash
cd web
docker build -f deploy/Dockerfile -t wallio-web .
docker run -d --name wallio-web -p 127.0.0.1:3000:3000 --restart unless-stopped wallio-web
```

Then use the same Caddy block as above.

## The `/api` proxy and `WALLIO_API_ORIGIN`

- **Behind this Caddy:** `/api/*` never reaches Next.js. Caddy sends it straight to the API, so the web app's own `/api` proxy isn't used.
- **Anywhere else** (local dev, or the web app hosted on its own): Next.js proxies `/api/*` to `WALLIO_API_ORIGIN`. Set it at build time and at run time, because Next reads its config in both. Point it at an API that accepts this app's origin (`APP_ORIGIN` on the API); otherwise the API refuses POSTs from a different origin.

## Notes

- The landing page and the app are static where possible; the API holds all state.
- Settings are saved in the browser until the API stores them.
- Don't put secrets in the web app's environment. It needs none.
