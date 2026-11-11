/**
 * Checks in the built image that every import of the server resolves (CI job "image"). The image
 * installs the runtime dependencies without peers (docker/Dockerfile); a missing package would
 * otherwise show only when someone first reaches the code that imports it. Bun resolves the
 * server and all it imports, down to the last file of each package, without running it; the
 * result stays in memory.
 *
 *   docker exec -i schreibzeug sh -c 'cat > /tmp/check-imports.ts && bun /tmp/check-imports.ts' < docker/check-imports.ts
 */
const ENTRY = "/app/apps/server/src/main.ts";

const result = await Bun.build({ entrypoints: [ENTRY], target: "bun", packages: "bundle", throw: false });

for (const log of result.logs) console.log(log.message);
console.log(result.success ? `ok: ${ENTRY} and all its imports` : `missing imports below ${ENTRY}`);
process.exit(result.success ? 0 : 1);

export {};
