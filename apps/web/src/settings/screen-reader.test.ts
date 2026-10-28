import { describe, expect, it } from "vitest";
import { readScreenReader, writeScreenReader } from "./screen-reader";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("the screen reader setting", () => {
  it("is off until switched on, and remembered", () => {
    const storage = memory();
    expect(readScreenReader(storage)).toBe(false);
    writeScreenReader(true, storage);
    expect(readScreenReader(storage)).toBe(true);
    writeScreenReader(false, storage);
    expect(readScreenReader(storage)).toBe(false);
  });

  it("stays off where the browser keeps no storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readScreenReader(refusing)).toBe(false);
    expect(() => writeScreenReader(true, refusing)).not.toThrow();
    expect(readScreenReader(null)).toBe(false);
  });
});
