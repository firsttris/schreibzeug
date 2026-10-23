import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "files-api",
    include: ["test/**/*.test.ts"],
  },
});
