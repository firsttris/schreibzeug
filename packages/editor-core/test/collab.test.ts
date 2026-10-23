import { describe, expect, it } from "vitest";
import { type CreateSocket, joinSession, reconnectDelay, type SocketLike } from "../src/collab";
import { createFrameSocketIO } from "../src/frame-socket";

/** Sockets the channel opened, newest last, with what was sent through them. */
const fakeSockets = () => {
  const opened: Array<SocketLike & { sent: string[]; closed: boolean }> = [];
  const create: CreateSocket = () => {
    const socket = {
      sent: [] as string[],
      closed: false,
      send: (data: string) => socket.sent.push(data),
      close: () => {
        socket.closed = true;
      },
      onopen: null,
      onmessage: null,
      onclose: null,
    } as SocketLike & { sent: string[]; closed: boolean };
    opened.push(socket);
    return socket;
  };
  const last = () => opened.at(-1) as (typeof opened)[number];
  const receive = (message: object) => last().onmessage?.({ data: JSON.stringify(message) });
  const drop = () => last().onclose?.();
  return { opened, create, last, receive, drop };
};

/** Timers that run when the test says so. */
const manualTimers = () => {
  const due: Array<{ run: () => void; ms: number }> = [];
  return {
    setTimer: (run: () => void, ms: number) => due.push({ run, ms }),
    due,
    runAll: () => {
      for (const timer of due.splice(0)) timer.run();
    },
  };
};

const session = (baseVersion: number) => ({ type: "stapel:session", baseVersion });

const recorder = () => {
  const events: string[] = [];
  return {
    events,
    listener: {
      open: () => events.push("open"),
      message: (json: string) => events.push(`message ${json}`),
      lost: () => events.push("lost"),
      restarted: () => events.push("restarted"),
    },
  };
};

describe("reconnectDelay", () => {
  it("grows from half a second and stops at five", () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });
});

describe("joinSession", () => {
  it("resolves with the version the relay names, and keeps what comes before a listener", async () => {
    const sockets = fakeSockets();
    const joining = joinSession("ws://x/api/collab/1", { createSocket: sockets.create });
    sockets.receive(session(3));
    sockets.receive({ type: "license" });
    const channel = await joining;
    expect(channel.baseVersion).toBe(3);

    const { events, listener } = recorder();
    channel.listen(listener);
    expect(events).toEqual(["open", 'message {"type":"license"}']);
  });

  it("shows observers every message but keeps our own from the engine", async () => {
    const sockets = fakeSockets();
    const joining = joinSession("ws://x", { createSocket: sockets.create });
    sockets.receive(session(1));
    const channel = await joining;
    const observed: string[] = [];
    channel.observe((json) => observed.push(json));
    const { events, listener } = recorder();
    channel.listen(listener);

    sockets.receive({ type: "stapel:saved", index: 2 });
    sockets.receive({ type: "cursor" });
    expect(observed).toEqual(['{"type":"stapel:saved","index":2}', '{"type":"cursor"}']);
    expect(events).toEqual(["open", 'message {"type":"cursor"}']);
  });

  it("sends through the current socket and closes it for good", async () => {
    const sockets = fakeSockets();
    const timers = manualTimers();
    const joining = joinSession("ws://x", { createSocket: sockets.create, setTimer: timers.setTimer });
    sockets.receive(session(1));
    const channel = await joining;
    channel.send('{"type":"auth"}');
    expect(sockets.last().sent).toEqual(['{"type":"auth"}']);

    channel.close();
    sockets.drop();
    expect(sockets.last().closed).toBe(true);
    expect(timers.due).toEqual([]);
  });

  it("reports a lost connection, reconnects and opens again at the same version", async () => {
    const sockets = fakeSockets();
    const timers = manualTimers();
    const joining = joinSession("ws://x", { createSocket: sockets.create, setTimer: timers.setTimer });
    sockets.receive(session(1));
    const channel = await joining;
    const { events, listener } = recorder();
    channel.listen(listener);

    sockets.drop();
    expect(timers.due.map((timer) => timer.ms)).toEqual([500]);
    timers.runAll();
    expect(sockets.opened).toHaveLength(2);
    sockets.receive(session(1));
    expect(events).toEqual(["open", "lost", "open"]);
  });

  it("tells the listener when the relay started a new session at another version", async () => {
    const sockets = fakeSockets();
    const timers = manualTimers();
    const joining = joinSession("ws://x", { createSocket: sockets.create, setTimer: timers.setTimer });
    sockets.receive(session(1));
    const channel = await joining;
    const { events, listener } = recorder();
    channel.listen(listener);

    sockets.drop();
    timers.runAll();
    sockets.receive(session(2));
    expect(events.at(-1)).toBe("restarted");
  });

  it("fails when the relay cannot be reached", async () => {
    const sockets = fakeSockets();
    const timers = manualTimers();
    const joining = joinSession("ws://x", {
      createSocket: sockets.create,
      setTimer: timers.setTimer,
      maxAttempts: 2,
    });
    sockets.drop();
    timers.runAll();
    sockets.drop();
    timers.runAll();
    sockets.drop();
    await expect(joining).rejects.toThrow("not reachable");
  });
});

describe("createFrameSocketIO", () => {
  const frameJson = { JSON: { parse: (text: string) => ({ parsedByFrame: JSON.parse(text) }) } };

  const connected = async () => {
    const sockets = fakeSockets();
    const timers = manualTimers();
    const joining = joinSession("ws://x", { createSocket: sockets.create, setTimer: timers.setTimer });
    sockets.receive(session(1));
    const channel = await joining;
    const io = createFrameSocketIO(frameJson, channel);
    const socket = io({ auth: { token: "t" } });
    const events: unknown[][] = [];
    for (const name of ["connect", "disconnect", "message"]) {
      socket.on(name, (...args: unknown[]) => events.push([name, ...args]));
    }
    const failed: string[] = [];
    socket.io.on("reconnect_failed", () => failed.push("reconnect_failed"));
    // The stand-in starts listening once sdkjs had the chance to register its handlers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { sockets, timers, socket, events, failed };
  };

  it("connects once the engine has registered its handlers, keeping the auth it was given", async () => {
    const { socket, events } = await connected();
    expect(socket.auth).toEqual({ token: "t" });
    expect(events).toEqual([["connect"]]);
  });

  it("sends messages as JSON and parses replies with the frame's JSON", async () => {
    const { sockets, socket, events } = await connected();
    socket.emit("message", { type: "auth" });
    expect(sockets.last().sent).toEqual(['{"type":"auth"}']);

    sockets.receive({ type: "license" });
    expect(events.at(-1)).toEqual(["message", { parsedByFrame: { type: "license" } }]);
  });

  it("fires socket.io's events for a dropped connection and a failed reconnect", async () => {
    const { sockets, timers, events, failed } = await connected();
    sockets.drop();
    expect(events.at(-1)).toEqual(["disconnect", "transport close"]);

    timers.runAll();
    sockets.receive(session(1));
    expect(events.at(-1)).toEqual(["connect"]);

    sockets.drop();
    timers.runAll();
    sockets.receive(session(5));
    expect(failed).toEqual(["reconnect_failed"]);
  });

  it("closes the channel when the engine disconnects", async () => {
    const { sockets, socket, events } = await connected();
    socket.disconnect();
    expect(sockets.last().closed).toBe(true);
    expect(events.at(-1)).toEqual(["disconnect", "io client disconnect"]);
  });
});
