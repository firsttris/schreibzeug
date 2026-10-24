import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "local",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
