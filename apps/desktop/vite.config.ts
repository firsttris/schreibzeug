/// <reference types="vitest/config" />
import { defineConfig } from "vite";

/** The desktop app's own page: where it asks for the server (src-tauri/tauri.conf.json frontendDist). */
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", target: "es2022" },
  test: { name: "desktop", environment: "happy-dom", include: ["src/**/*.test.ts"] },
});
