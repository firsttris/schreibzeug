import { describe, expect, it } from "vitest";
import { keys } from "./keys";

describe("keys", () => {
  it("names the keys as a German keyboard does", () => {
    expect(keys("Ctrl+Shift+Z")).toBe("Strg+Umschalt+Z");
    expect(keys("Ctrl+Space")).toBe("Strg+Leertaste");
    expect(keys("Ctrl+X / C / V")).toBe("Strg+X / C / V");
    expect(keys("F6 / Shift+F6")).toBe("F6 / Umschalt+F6");
  });

  it("leaves the keys alone that every keyboard names alike", () => {
    expect(keys("Alt+Enter")).toBe("Alt+Enter");
    expect(keys("Tab")).toBe("Tab");
  });
});
