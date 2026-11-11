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
# again. The download it unpacked is dropped, so the cache holds only engine/dist. The Brotli
# copies at quality 11 the server sends (precompress.ts) take two minutes, so they are made here too.
COPY engine engine
RUN bun engine/scripts/prepare.ts && rm -rf engine/.cache && bun engine/scripts/precompress.ts
# .dockerignore leaves out every dist/, so engine/dist stays as prepared.
COPY . .
RUN bun install --frozen-lockfile && bun run build

# The runtime on Wolfi instead of Debian, as in Haben and Kontext (firsttris/kontext#248): current
# system packages and few known vulnerabilities. Wolfi is rolling; the digest keeps the build
# reproducible and Renovate raises it (group "Wolfi"). Nothing but Bun runs here, and Bun needs only
# glibc (its NEEDED entries: libc, ld-linux, libpthread, libdl, libm), which wolfi-base has.
FROM cgr.dev/chainguard/wolfi-base:latest@sha256:b7787f1d3f29dcfb48730372d3515391ac3b218723201a765c94949922676099
# The same Bun as in the build stage (glibc build); Renovate raises oven/bun at both places.
COPY --from=docker.io/oven/bun:1.4-slim /usr/local/bin/bun /usr/local/bin/bun
# The user "bun" with UID 1000 as in oven/bun's image, so existing volumes stay readable.
RUN addgroup -g 1000 bun && adduser -D -u 1000 -G bun -h /home/bun -s /bin/sh bun
WORKDIR /app
ENV NODE_ENV=production PORT=3000 SCHREIBZEUG_DATA_DIR=/data SCHREIBZEUG_WEB_DIR=/app/web
# The server and the workspace packages it imports; the other workspaces only for the lockfile.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/local/package.json apps/local/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages packages
COPY apps/server apps/server
# Without peer dependencies: through them build tools would come into the image (vite, vitest,
# drizzle-kit, esbuild with a Go runtime of its own) that never run there and only add known
# vulnerabilities. What the server imports is checked in the image by docker/check-imports.ts.
RUN bun install --frozen-lockfile --production --ignore-scripts --omit=peer
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
