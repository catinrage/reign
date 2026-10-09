# syntax=docker/dockerfile:1

# Reign as one container: the Node server runs the rules and the WebSocket and serves the built
# client from dist/client. Build with `docker build -t reign .` or run `docker compose up`.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Every dependency, for building the client (and for the dev service in compose.yaml).
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

# Runtime dependencies only: ws and tsx.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src/shared ./src/shared
COPY src/server ./src/server
COPY --from=build /app/dist/client ./dist/client
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
	CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Node runs the server directly (no pnpm in between) so it gets docker's stop signal.
CMD ["node", "--import", "tsx", "src/server/index.ts"]
