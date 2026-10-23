import type { CollabChannel } from "./collab";

type Handler = (...args: unknown[]) => void;

/** What sdkjs reads from the frame's window to parse what the relay sends (see below). */
type FrameJson = { JSON: { parse: (text: string) => unknown } };

/**
 * A stand-in for the socket.io client in the engine's frame. sdkjs takes `window.io` if it is a
 * function (common/editorscommon.js getSocketIO) and uses only this part of it
 * (common/docscoapi.js _initSocksJs): `on("connect" | "disconnect" | "connect_error" | "message")`,
 * `emit("message", data)`, `connect()`, `disconnect()`, `auth`, and `io.on / io.opts /
 * io.reconnection*`. Messages go to the relay as JSON text through the channel.
 *
 * What the relay sends is parsed with the frame's own JSON, so the objects belong to the frame:
 * sdkjs checks values with instanceof, which fails for objects from the app's window.
 */
export const createFrameSocketIO =
  (frame: FrameJson, channel: CollabChannel) => (options: { auth?: unknown }) => {
    const handlers = new Map<string, Handler[]>();
    const managerHandlers = new Map<string, Handler[]>();
    const fire = (name: string, ...args: unknown[]) => {
      for (const handler of handlers.get(name) ?? []) handler(...args);
    };
    const add = (map: Map<string, Handler[]>, name: string, handler: Handler) =>
      map.set(name, [...(map.get(name) ?? []), handler]);
    let stopListening = () => {};

    const socket = {
      auth: options.auth,
      on: (name: string, handler: Handler) => {
        add(handlers, name, handler);
        return socket;
      },
      emit: (name: string, data: unknown) => {
        if (name === "message") channel.send(JSON.stringify(data));
        return socket;
      },
      connect: () => socket,
      disconnect: () => {
        stopListening();
        channel.close();
        fire("disconnect", "io client disconnect");
        return socket;
      },
      io: {
        opts: {},
        on: (name: string, handler: Handler) => add(managerHandlers, name, handler),
        reconnectionAttempts: () => {},
        reconnectionDelay: () => {},
        reconnectionDelayMax: () => {},
      },
    };

    // sdkjs registers its handlers right after io() returns; connect once it has.
    setTimeout(() => {
      stopListening = channel.listen({
        open: () => fire("connect"),
        message: (json) => fire("message", frame.JSON.parse(json)),
        // socket.io's reason for a dropped connection; sdkjs then waits for "connect" to restore.
        lost: () => fire("disconnect", "transport close"),
        restarted: () => {
          for (const handler of managerHandlers.get("reconnect_failed") ?? []) handler();
        },
      });
    }, 0);

    return socket;
  };
