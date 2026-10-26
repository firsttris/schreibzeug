# Schreibzeug: the web app with its engine and the server (files, accounts, collaboration) in one
# image, run by Bun. The engine comes from the pinned Euro-Office release (engine/engine.json);
# its font tool is a Linux x86_64 binary, so the image is built for amd64.
FROM docker.io/oven/bun:1.4 AS build
# engine/scripts/prepare.ts unpacks the Document Server package with ar and tar (xz) and the x2t
# WebAssembly build with unzip; the bun image has none of them.
RUN apt-get update \
  && apt-get install -y --no-install-recommends binutils xz-utils unzip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The engine first, in a layer of its own: it changes only with engine/ (a pinned release), so the
# release reuses it from the build cache instead of downloading 632 MB and generating the fonts
# again. The download it unpacked is dropped, so the cache holds only engine/dist.
COPY engine engine
RUN bun engine/scripts/prepare.ts && rm -rf engine/.cache
# .dockerignore leaves out every dist/, so engine/dist stays as prepared.
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM docker.io/oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 SCHREIBZEUG_DATA_DIR=/data SCHREIBZEUG_WEB_DIR=/app/web
# The server and the workspace packages it imports; the other workspaces only for the lockfile.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/local/package.json apps/local/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages packages
COPY apps/server apps/server
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/apps/web/dist ./web
# The server runs as the image's unprivileged user `bun` (uid 1000), which may write only /data.
# The folder is made and handed to it before VOLUME, so a new volume starts out owned by it; an
# older volume made by root needs a chown once (docs/installation.md).
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["bun", "apps/server/src/main.ts"]
