import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "pdf-sign",
    include: ["test/**/*.test.ts"],
  },
});
