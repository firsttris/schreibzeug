import { defineConfig } from "drizzle-kit";

/** `bun run db:generate` writes a migration for every change to src/db/schema.ts. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
