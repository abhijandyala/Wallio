# Wallio web app. Build from the web/ folder:
#   docker build -f deploy/Dockerfile -t wallio-web .
#   docker run -p 3000:3000 -e WALLIO_API_ORIGIN=https://<api-host> wallio-web
# Uses `next start` (standalone output isn't configured).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Where /api is proxied when the app isn't served behind the API's Caddy.
ARG WALLIO_API_ORIGIN
ENV WALLIO_API_ORIGIN=${WALLIO_API_ORIGIN}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
