import { describe, expect, it } from "vitest";
import { readSpellCheck, writeSpellCheck } from "./spell-check";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("the spell check setting", () => {
  it("is on until switched off, and remembered", () => {
    const storage = memory();
    expect(readSpellCheck(storage)).toBe(true);
    writeSpellCheck(false, storage);
    expect(readSpellCheck(storage)).toBe(false);
    writeSpellCheck(true, storage);
    expect(readSpellCheck(storage)).toBe(true);
  });

  it("stays on where the browser keeps no storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readSpellCheck(refusing)).toBe(true);
    expect(() => writeSpellCheck(false, refusing)).not.toThrow();
    expect(readSpellCheck(null)).toBe(true);
  });
});
