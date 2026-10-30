import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "engine",
    include: ["scripts/**/*.test.ts"],
  },
});
