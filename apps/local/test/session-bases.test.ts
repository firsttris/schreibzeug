import { describe, expect, it } from "vitest";
import { createSessionBases } from "../src/session-bases";

describe("the versions sessions started at", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it("keeps the bytes of a session's first load, not those of a read racing a save", () => {
    const base = { version: 1 as number | undefined, changes: 1 };
    const bases = createSessionBases(() =>
      base.version === undefined
        ? undefined
        : { generation: 1, baseVersion: base.version, changes: base.changes },
    );
    expect(bases.bytesOf("f", 1, 1, bytes(1))).toEqual(bytes(1));
    // A read whose stat came before a save's rename and whose read came after it.
    expect(bases.bytesOf("f", 1, 1, bytes(1, 2))).toEqual(bytes(1, 2));
    expect(bases.bytesOf("f", 1, 2, bytes(1, 2))).toEqual(bytes(1));
  });

  it("has no older version once its session is gone", () => {
    const base = { version: 1 as number | undefined, changes: 1 };
    const bases = createSessionBases(() =>
      base.version === undefined
        ? undefined
        : { generation: 1, baseVersion: base.version, changes: base.changes },
    );
    bases.bytesOf("f", 1, 1, bytes(1));
    base.version = undefined;
    expect(bases.bytesOf("f", 1, 2, bytes(1, 2))).toBeNull();
    expect(bases.bytesOf("f", undefined, 2, bytes(1, 2))).toEqual(bytes(1, 2));
  });

  it("starts from the file as it is when it was written from outside before the first load", () => {
    const session = { generation: 1, baseVersion: 1, changes: 0 };
    const bases = createSessionBases(() => session);
    expect(bases.bytesOf("f", 1, 2, bytes(9))).toEqual(bytes(9));
    session.changes = 1;
    expect(bases.bytesOf("f", 1, 3, bytes(7))).toEqual(bytes(9)); // what everyone opened
  });

  it("has no start once a change was made on a version it never loaded", () => {
    const bases = createSessionBases(() => ({ generation: 1, baseVersion: 1, changes: 1 }));
    expect(bases.bytesOf("f", 1, 2, bytes(9))).toBeNull();
  });

  it("keeps the bytes of each session apart, also at the same version number", () => {
    // Another program's write keeps the local version number.
    const session = { generation: 1, baseVersion: 1, changes: 0 };
    const bases = createSessionBases(() => session);
    bases.bytesOf("f", 1, 1, bytes(0xa));
    session.generation = 2; // the first session ended; the file was written from outside
    expect(bases.bytesOf("f", 1, 1, bytes(0xb))).toEqual(bytes(0xb));
    expect(bases.bytesOf("f", 1, 2, bytes(0xb))).toEqual(bytes(0xb));
  });
});
