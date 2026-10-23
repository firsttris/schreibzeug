/// <reference types="vitest/config" />
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { enginePlugin } from "./engine-plugin";

/** The Stapel server the dev server forwards /api to (apps/server, `bun run server`). */
const apiUrl = process.env.STAPEL_API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss(), enginePlugin(resolve(import.meta.dirname, "../../engine/dist"))],
  server: { port: 5173, strictPort: true, proxy: { "/api": apiUrl } },
  preview: { port: 4173, strictPort: true, proxy: { "/api": apiUrl } },
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
  },
});
