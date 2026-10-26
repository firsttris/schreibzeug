import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "text-editor",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
