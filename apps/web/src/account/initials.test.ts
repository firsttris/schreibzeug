import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes the first letters of up to two names", () => {
    expect(initialsOf("Anna Berger")).toBe("AB");
    expect(initialsOf("anna maria berger")).toBe("AM");
    expect(initialsOf("  Ben ")).toBe("B");
    expect(initialsOf("")).toBe("");
  });

  it("takes a whole character outside the BMP, not half of it", () => {
    expect(initialsOf("𝓐nna 𝓑erger")).toBe("𝓐𝓑");
  });
});
