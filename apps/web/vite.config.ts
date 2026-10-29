/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { enginePlugin } from "./engine-plugin";
import { ocrPlugin } from "./ocr-plugin";

/** The Schreibzeug server the dev server forwards /api to (apps/server, `bun run server`). */
const apiUrl = process.env.SCHREIBZEUG_API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The interface texts (messages/de.json, messages/en.json) as functions in src/paraglide; the
    // options are in project.inlang/paraglide.config.js.
    paraglideVitePlugin({
      project: resolve(import.meta.dirname, "project.inlang"),
      outdir: resolve(import.meta.dirname, "src/paraglide"),
    }),
    enginePlugin(resolve(import.meta.dirname, "../../engine/dist")),
    ocrPlugin(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: apiUrl, ws: true }, "/mcp": { target: apiUrl } },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": { target: apiUrl, ws: true }, "/mcp": { target: apiUrl } },
  },
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
