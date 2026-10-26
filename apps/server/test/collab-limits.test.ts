import { describe, expect, it } from "vitest";
import { createHub } from "../src/collab/hub";
import { ENGINE_CLOSE, LOG_LIMITS } from "../src/collab/limits";
import { createSession, LOG_FULL, receive, type Session, type StoredChange } from "../src/collab/session";

const FILE = "8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11";
const NOW = 1_800_000_000_000;

const auth = (user: string) => ({ type: "auth", user: { id: user, username: user } });
const save = (changes: string[]) => ({
  type: "saveChanges",
  changes: JSON.stringify(changes),
  startSaveChanges: true,
  endSaveChanges: true,
});

const stored = (change: string): StoredChange => ({
  docid: FILE,
  change,
  time: NOW,
  user: "anna1",
  useridoriginal: "anna",
});

/** A session Anna joined whose log already holds `changes`. */
const withLog = (changes: StoredChange[]): Session =>
  receive({ ...createSession(FILE, 1), changes, savedIndex: changes.length }, "a", auth("anna"), NOW).session;

describe("the ceiling of a session's log", () => {
  const drop = { type: "drop", code: ENGINE_CLOSE.drop, description: LOG_FULL };

  it("takes no change past the number of changes it may hold and sends the engine away", () => {
    const full = withLog(Array.from({ length: LOG_LIMITS.changes }, () => stored('"c"')));
    const { session, out } = receive(full, "a", save(["one more"]), NOW);
    expect(out).toEqual([{ to: "self", message: drop }]);
    expect(session.changes).toHaveLength(LOG_LIMITS.changes);
  });

  it("takes no change past the bytes it may hold", () => {
    const full = withLog([stored("x".repeat(LOG_LIMITS.bytes - 4))]);
    // Stored as JSON: '"abc"' is five bytes, one too many; '""' two.
    expect(receive(full, "a", save(["abc"]), NOW).out).toEqual([{ to: "self", message: drop }]);
    expect(receive(full, "a", save([""]), NOW).session.changes).toHaveLength(2);
  });
});

describe("a session nobody is in", () => {
  const setup = () => {
    const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
    const hub = createHub({
      access: async () => ({ version: 1, role: "edit" }),
      now: () => NOW,
      idleMs: 1000,
      setTimer: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    const fire = () => {
      for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run();
    };
    const leaveWithChange = async () => {
      const id = (await hub.open(FILE, { id: "anna", name: "Anna" }, () => {})) as string;
      hub.message(id, auth("anna"));
      hub.message(id, save(["c1"]));
      hub.close(id);
    };
    return { hub, timers, fire, leaveWithChange };
  };

  it("ends after a while, also with changes no version holds", async () => {
    const { hub, timers, fire, leaveWithChange } = setup();
    await leaveWithChange();
    expect(hub.session(FILE)?.changes).toHaveLength(1);
    expect(timers.map(({ ms }) => ms)).toEqual([1000]);
    fire();
    expect(hub.session(FILE)).toBeUndefined();
  });

  it("waits no longer once someone comes back", async () => {
    const { hub, fire, leaveWithChange } = setup();
    await leaveWithChange();
    await hub.open(FILE, { id: "ben", name: "Ben" }, () => {});
    fire();
    expect(hub.session(FILE)?.changes).toHaveLength(1);
  });

  it("waits again while a save is under way", async () => {
    const { hub, timers, fire, leaveWithChange } = setup();
    await leaveWithChange();
    expect(hub.begin(FILE, { baseVersion: 1, index: 1 })).toBe(true);
    fire();
    expect(hub.session(FILE)).toBeDefined();
    expect(timers).toHaveLength(1);
    hub.stored(FILE, 2, { baseVersion: 1, index: 1 });
    fire();
    expect(hub.session(FILE)).toBeUndefined();
  });
});
