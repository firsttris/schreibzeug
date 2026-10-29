import { createWSMessageEvent, defineWebSocketHelper, WSContext, type WSReadyState } from "hono/ws";

/**
 * WebSockets to the API in the page: what the app's code sees of a browser WebSocket (editor-core
 * collab.ts `SocketLike`), and on the API's side Hono's WebSocket helper, as `hono/bun` gives it to
 * the local server (apps/local main.ts). So the collaboration route and its hub
 * (apps/server src/collab) run unchanged; only the wire between them is a function call.
 */
export type PageSocket = {
  readyState: WSReadyState;
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
};

/** Which socket a request upgrades: the API gets it by this header, as a server gets the TCP connection. */
const SOCKET_HEADER = "x-schreibzeug-page-socket";

/** As a browser closes a socket nobody accepted (RFC 6455 1006, "abnormal closure"). */
const REFUSED = 1006;

type Waiting = { socket: PageSocket; accept: (events: Events) => void };
type Events = Parameters<Parameters<typeof defineWebSocketHelper>[0]>[1];

/** Runs after the current task, in order: a message never arrives before its handler is set. */
const later = (run: () => void) => setTimeout(run, 0);

export const createPageSockets = () => {
  const waiting = new Map<string, Waiting>();

  /** For the API (apps/local app.ts `collab.upgradeWebSocket`): takes the socket the request names. */
  const upgradeWebSocket = defineWebSocketHelper((c, events) => {
    const id = c.req.header(SOCKET_HEADER);
    const socket = id === undefined ? undefined : waiting.get(id);
    if (!socket) return;
    waiting.delete(id as string);
    socket.accept(events);
    return new Response(null, { status: 200 });
  });

  /**
   * A socket to `url`, connected through `fetch` (the API in the page) as a browser connects:
   * open once the API took it, closed with 1006 when it answered without taking it.
   */
  const connect = (url: string, fetch: (request: Request) => Promise<Response>): PageSocket => {
    const id = crypto.randomUUID();
    let events: Events | null = null;
    let ws: WSContext | null = null;

    const closed = (code: number, reason: string) => {
      if (socket.readyState === 3) return;
      socket.readyState = 3;
      if (ws) events?.onClose?.(new CloseEvent("close", { code, reason }), ws);
      later(() => socket.onclose?.({ code, reason }));
    };

    const socket: PageSocket = {
      readyState: 0,
      send: (data) => {
        if (socket.readyState !== 1) return;
        later(() => {
          if (ws && socket.readyState === 1) events?.onMessage?.(createWSMessageEvent(data), ws);
        });
      },
      close: () => closed(1000, ""),
      onopen: null,
      onmessage: null,
      onclose: null,
    };

    const accept = (taken: Events) => {
      events = taken;
      ws = new WSContext({
        get readyState() {
          return socket.readyState;
        },
        url,
        send: (data) => {
          if (socket.readyState === 1) later(() => socket.onmessage?.({ data }));
        },
        close: (code = 1000, reason = "") => closed(code, reason),
      });
    };

    waiting.set(id, { socket, accept });
    const http = url.replace(/^ws/, "http");
    fetch(new Request(http, { headers: { upgrade: "websocket", [SOCKET_HEADER]: id } }))
      .catch(() => null)
      .then(() => {
        waiting.delete(id);
        if (!ws || !events) return closed(REFUSED, "");
        if (socket.readyState !== 0) return;
        socket.readyState = 1;
        events.onOpen?.(new Event("open"), ws);
        later(() => socket.onopen?.());
      });
    return socket;
  };

  return { upgradeWebSocket, connect };
};
