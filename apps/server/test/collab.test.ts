import { describe, expect, it } from "vitest";
import { createHub } from "../src/collab/hub";
import { createSession, type Outgoing, RESTORE_CODE, receive, type Session } from "../src/collab/session";

const FILE = "8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11";
const NOW = 1_800_000_000_000;

const auth = (user: string, extra: Record<string, unknown> = {}) => ({
  type: "auth",
  user: { id: user, username: user.toUpperCase() },
  openCmd: { url: `blob:${user}` },
  ...extra,
});

/** Runs messages through the session like the hub, keeping what each step sent. */
const run = (steps: Array<[string, Record<string, unknown>]>, start: Session = createSession(FILE, 3)) =>
  steps.reduce(
    ({ session, log }, [connection, data], index) => {
      const step = receive(session, connection, data as { type: string }, NOW + index * 1000);
      return { session: step.session, log: [...log, { connection, out: step.out }] };
    },
    { session: start, log: [] as Array<{ connection: string; out: Outgoing[] }> },
  );

const types = (out: Outgoing[]) => out.map(({ to, message }) => `${to}:${String(message.type)}`);

describe("collaboration session", () => {
  const change = (connection: string, changes: string[]): [string, Record<string, unknown>] => [
    connection,
    { type: "saveChanges", changes: JSON.stringify(changes), startSaveChanges: true, endSaveChanges: true },
  ];

  it("tells everyone how much of the log a stored version holds, never less than before", () => {
    const { session, log } = run([
      ["a", auth("anna")],
      ["b", auth("ben")],
      change("a", ["c1", "c2", "c3"]),
      ["b", { type: "stapel:saved", index: 2 }],
      ["a", { type: "stapel:saved", index: 1 }],
      ["a", { type: "stapel:saved", index: 99 }],
    ]);
    expect(log[3]?.out).toEqual([{ to: "all", message: { type: "stapel:saved", index: 2 } }]);
    expect(log[4]?.out[0]?.message).toEqual({ type: "stapel:saved", index: 2 });
    // An index past the log counts as the whole log.
    expect(session.savedIndex).toBe(3);
  });

  it("ignores a saved message without an index", () => {
    const { session, log } = run([
      ["a", auth("anna")],
      ["a", { type: "stapel:saved" }],
    ]);
    expect(log[1]?.out).toEqual([]);
    expect(session.savedIndex).toBe(0);
  });

  it("tells someone joining later how much is stored", () => {
    const { log } = run([
      ["a", auth("anna")],
      change("a", ["c1"]),
      ["a", { type: "stapel:saved", index: 1 }],
      ["b", auth("ben")],
    ]);
    expect(log[3]?.out.at(-1)?.message).toEqual({ type: "stapel:saved", index: 1 });
  });

  it("forgets a save for changes that are sent again", () => {
    const { session } = run([
      ["a", auth("anna")],
      change("a", ["c1", "c2"]),
      ["a", { type: "stapel:saved", index: 2 }],
      [
        "a",
        {
          type: "saveChanges",
          changes: JSON.stringify(["c2"]),
          startSaveChanges: true,
          endSaveChanges: true,
          deleteIndex: 1,
        },
      ],
    ]);
    expect(session.savedIndex).toBe(1);
  });

  it("lets a client in with the changes so far, the session and the file to open", () => {
    const { session, log } = run([["a", auth("anna")]]);
    expect(types(log[0]?.out ?? [])).toEqual([
      "self:authChanges",
      "self:auth",
      "self:documentOpen",
      "others:connectState",
      "self:stapel:saved",
    ]);
    expect(log[0]?.out[2]?.message).toMatchObject({ data: { data: { "Editor.bin": "blob:anna" } } });
    expect(session.participants).toMatchObject([
      { id: "anna1", idOriginal: "anna", username: "ANNA", indexUser: 1 },
    ]);
  });

  it("appends changes, sends them to the others and tells the sender where they went", () => {
    const { session, log } = run([
      ["a", auth("anna")],
      ["b", auth("ben")],
      [
        "a",
        {
          type: "saveChanges",
          changes: JSON.stringify(["c1", "c2"]),
          startSaveChanges: true,
          endSaveChanges: true,
        },
      ],
    ]);
    const out = log[2]?.out ?? [];
    expect(types(out)).toEqual(["others:saveChanges", "self:unSaveLock"]);
    expect(out[0]?.message).toMatchObject({
      changesIndex: 2,
      changes: [
        { change: '"c1"', user: "anna1", useridoriginal: "anna" },
        { change: '"c2"', user: "anna1" },
      ],
    });
    expect(out[1]?.message).toMatchObject({ index: 0, syncChangesIndex: 2 });
    expect(session.changes).toHaveLength(2);
  });

  it("gives a later client every change since the session began", () => {
    const { log } = run([
      ["a", auth("anna")],
      ["a", { type: "saveChanges", changes: '["c1"]', startSaveChanges: true, endSaveChanges: true }],
      ["b", auth("ben")],
    ]);
    expect(log[2]?.out[0]?.message).toMatchObject({ type: "authChanges", changes: [{ change: '"c1"' }] });
    expect(log[2]?.out[1]?.message).toMatchObject({ indexUser: 2 });
  });

  it("answers a partial save without releasing anything", () => {
    const { log } = run([
      ["a", auth("anna")],
      ["a", { type: "saveChanges", changes: '["c1"]', startSaveChanges: true, endSaveChanges: false }],
    ]);
    expect(types(log[1]?.out ?? [])).toEqual(["others:saveChanges", "self:savePartChanges"]);
  });

  it("grants locks, tells everyone, and frees them with the save that asks for it", () => {
    const { session, log } = run([
      ["a", auth("anna")],
      ["a", { type: "getLock", block: ["p1", { guid: "p2" }] }],
      ["a", { type: "saveChanges", changes: "[]", endSaveChanges: true, releaseLocks: true }],
    ]);
    expect(log[1]?.out[0]).toMatchObject({
      to: "all",
      message: { type: "getLock", locks: { p1: { user: "anna1" }, p2: {} } },
    });
    expect(log[2]?.out[0]?.message).toMatchObject({ locks: [{ block: "p1" }, { block: { guid: "p2" } }] });
    expect(session.locks).toEqual({});
  });

  it("passes cursors on to the others", () => {
    const { log } = run([
      ["a", auth("anna")],
      ["a", { type: "cursor", cursor: "1;2;3" }],
    ]);
    expect(log[1]?.out).toEqual([
      {
        to: "others",
        message: {
          type: "cursor",
          messages: [{ cursor: "1;2;3", time: NOW + 1000, user: "anna1", useridoriginal: "anna" }],
        },
      },
    ]);
  });

  it("restores a returning client when nobody else changed anything meanwhile", () => {
    const { session, log } = run([
      ["a", auth("anna")],
      ["b", auth("ben")],
      ["a", { type: "saveChanges", changes: '["c1"]', startSaveChanges: true, endSaveChanges: true }],
      [
        "b2",
        auth("ben", {
          sessionId: "b",
          user: { id: "ben", username: "BEN", indexUser: 2 },
          lastOtherSaveTime: NOW + 2000,
          block: ["p9"],
        }),
      ],
    ]);
    expect(types(log[3]?.out ?? [])).toEqual([
      "self:auth",
      "others:connectState",
      "others:getLock",
      "self:stapel:saved",
    ]);
    expect(session.participants.map((p) => [p.connectionId, p.id])).toEqual([
      ["a", "anna1"],
      ["b2", "ben2"],
    ]);
    expect(session.locks.p9).toMatchObject({ user: "ben2" });
  });

  it("sends a returning client away when someone changed the document meanwhile", () => {
    const { log } = run([
      ["a", auth("anna")],
      ["b", auth("ben")],
      ["a", { type: "saveChanges", changes: '["c1"]', startSaveChanges: true, endSaveChanges: true }],
      ["b2", auth("ben", { sessionId: "b", user: { id: "ben", indexUser: 2 }, lastOtherSaveTime: 0 })],
    ]);
    expect(log[3]?.out).toEqual([
      {
        to: "self",
        message: { type: "error", description: "Restore error. Document modified.", code: RESTORE_CODE },
      },
    ]);
  });
});

describe("collaboration hub", () => {
  const setup = (versions: Record<string, number> = { [FILE]: 3 }) => {
    const hub = createHub({ currentVersion: async (id) => versions[id] ?? null, now: () => NOW });
    const join = async () => {
      const messages: Array<Record<string, unknown>> = [];
      const id = await hub.open(FILE, (message) => messages.push(message));
      return { id: id as string, messages };
    };
    return { hub, join };
  };

  it("tells a new connection which version to open, then sends the license", async () => {
    const { join } = setup();
    const { messages } = await join();
    expect(messages).toEqual([
      { type: "stapel:session", baseVersion: 3 },
      expect.objectContaining({ type: "license" }),
    ]);
  });

  it("refuses a file that does not exist", async () => {
    const { hub } = setup({});
    expect(await hub.open(FILE, () => {})).toBeNull();
  });

  it("delivers to the right connections and ends the session with the last one", async () => {
    const { hub, join } = setup();
    const a = await join();
    const b = await join();
    hub.message(a.id, auth("anna"));
    hub.message(b.id, auth("ben"));
    hub.message(a.id, {
      type: "saveChanges",
      changes: '["c1"]',
      startSaveChanges: true,
      endSaveChanges: true,
    });
    expect(b.messages.map((m) => m.type)).toContain("saveChanges");
    expect(a.messages.filter((m) => m.type === "saveChanges")).toEqual([]);

    hub.close(a.id);
    expect(b.messages.at(-1)).toMatchObject({ type: "connectState", participants: [{ id: "ben2" }] });
    hub.close(b.id);
    expect(hub.session(FILE)).toBeUndefined();
  });
});
