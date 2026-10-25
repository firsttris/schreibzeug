import { describe, expect, it } from "vitest";
import { createSessionBases } from "../src/session-bases";

describe("the versions sessions started at", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it("keeps the bytes of a session's first load, not those of a read racing a save", () => {
    const base = { version: 1 as number | undefined };
    const bases = createSessionBases(() => base.version);
    expect(bases.bytesOf("f", 1, 1, bytes(1))).toEqual(bytes(1));
    // A read whose stat came before a save's rename and whose read came after it.
    expect(bases.bytesOf("f", 1, 1, bytes(1, 2))).toEqual(bytes(1, 2));
    expect(bases.bytesOf("f", 1, 2, bytes(1, 2))).toEqual(bytes(1));
  });

  it("has no older version once its session is gone", () => {
    const base = { version: 1 as number | undefined };
    const bases = createSessionBases(() => base.version);
    bases.bytesOf("f", 1, 1, bytes(1));
    base.version = undefined;
    expect(bases.bytesOf("f", 1, 2, bytes(1, 2))).toBeNull();
    expect(bases.bytesOf("f", undefined, 2, bytes(1, 2))).toEqual(bytes(1, 2));
  });
});
