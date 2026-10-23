/**
 * The connection to the collaboration relay (apps/server src/collab): one WebSocket per open
 * document, JSON text both ways. It reconnects on its own; what sdkjs makes of a reconnect is up
 * to sdkjs (frame-socket.ts hands it the events socket.io would fire).
 */

export type SocketLike = {
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
};

export type CreateSocket = (url: string) => SocketLike;

export type ChannelListener = {
  open: () => void;
  message: (json: string) => void;
  /** The connection dropped; a reconnect follows. */
  lost: () => void;
  /** The relay started a new session at another version: the document must be opened again. */
  restarted: () => void;
};

export type CollabChannel = {
  /** The file version the session started from: open this one, then the changes follow. */
  baseVersion: number;
  send: (json: string) => void;
  /**
   * The engine's listener: gets sdkjs's messages only, not ours (`stapel:…`). Messages that came
   * before it are replayed to it.
   */
  listen: (listener: ChannelListener) => () => void;
  /** Watches every message from the relay, ours included, from the moment it is delivered. */
  observe: (observer: (json: string) => void) => () => void;
  close: () => void;
};

const SESSION = "stapel:session";

/** The `type` of a relay message, or null for anything else. */
export const messageType = (json: string): string | null => {
  try {
    const value = JSON.parse(json) as { type?: unknown };
    return typeof value?.type === "string" ? value.type : null;
  } catch {
    return null;
  }
};

/** Our own messages; sdkjs never sees them. */
const isOwnMessage = (json: string): boolean => messageType(json)?.startsWith("stapel:") ?? false;

/** Waits between reconnects, growing to a few seconds. */
export const reconnectDelay = (attempt: number): number => Math.min(500 * 2 ** attempt, 5_000);

const sessionVersion = (json: string): number | null => {
  try {
    const value = JSON.parse(json) as { type?: unknown; baseVersion?: unknown };
    return value.type === SESSION && typeof value.baseVersion === "number" ? value.baseVersion : null;
  } catch {
    return null;
  }
};

export type JoinOptions = {
  createSocket?: CreateSocket;
  /** Gives up after this many failed reconnects in a row. */
  maxAttempts?: number;
  setTimer?: (run: () => void, ms: number) => void;
};

/**
 * Connects to a file's session and resolves once the relay said which version to open. Messages
 * before the engine listens (the license comes right after) are kept for it.
 */
export const joinSession = (
  url: string,
  {
    createSocket = (target) => new WebSocket(target) as unknown as SocketLike,
    maxAttempts = 20,
    setTimer = (run, ms) => setTimeout(run, ms),
  }: JoinOptions = {},
): Promise<CollabChannel> =>
  new Promise((resolve, reject) => {
    let listener: ChannelListener | null = null;
    const observers = new Set<(json: string) => void>();
    const pending: string[] = [];
    let socket: SocketLike;
    let baseVersion: number | null = null;
    let closed = false;
    let attempt = 0;
    let open = false;

    const deliver = (json: string) => {
      for (const observer of observers) observer(json);
      if (!isOwnMessage(json)) listener?.message(json);
    };

    const channel = (version: number): CollabChannel => ({
      baseVersion: version,
      send: (json) => socket.send(json),
      listen: (next) => {
        listener = next;
        if (open) next.open();
        for (const json of pending.splice(0)) deliver(json);
        return () => {
          if (listener === next) listener = null;
        };
      },
      observe: (observer) => {
        observers.add(observer);
        return () => observers.delete(observer);
      },
      close: () => {
        closed = true;
        socket.close();
      },
    });

    const connect = () => {
      socket = createSocket(url);
      socket.onmessage = ({ data }) => {
        if (typeof data !== "string") return;
        const version = sessionVersion(data);
        if (version !== null) {
          attempt = 0;
          open = true;
          if (baseVersion === null) {
            baseVersion = version;
            resolve(channel(version));
          } else if (version !== baseVersion) {
            listener?.restarted();
          } else {
            listener?.open();
          }
          return;
        }
        if (listener) deliver(data);
        else pending.push(data);
      };
      socket.onclose = () => {
        const wasOpen = open;
        open = false;
        if (closed) return;
        if (baseVersion === null && attempt >= maxAttempts) {
          reject(new Error("The collaboration server is not reachable."));
          return;
        }
        if (wasOpen) listener?.lost();
        if (attempt >= maxAttempts) return;
        setTimer(connect, reconnectDelay(attempt));
        attempt += 1;
      };
    };
    connect();
  });
