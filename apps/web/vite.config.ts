/// <reference types="vitest/config" />
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { enginePlugin } from "./engine-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), enginePlugin(resolve(import.meta.dirname, "../../engine/dist"))],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
  },
});
