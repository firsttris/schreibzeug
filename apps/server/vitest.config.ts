import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests create a database each; that takes longer than a unit test.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
