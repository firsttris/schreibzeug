import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "einvoice",
    include: ["test/**/*.test.ts"],
  },
});
