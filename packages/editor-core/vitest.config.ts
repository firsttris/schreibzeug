import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "editor-core",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
