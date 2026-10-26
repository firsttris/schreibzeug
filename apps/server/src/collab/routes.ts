import { nodeIdSchema } from "@schreibzeug/files-api";
import { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import type { AuthEnv } from "../auth/middleware";
import type { Hub } from "./hub";
import { SOCKET_CLOSE as CLOSE } from "./limits";
import type { Incoming } from "./session";

const parse = (data: unknown): Incoming | null => {
  if (typeof data !== "string") return null;
  try {
    const value: unknown = JSON.parse(data);
    return value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string"
      ? (value as Incoming)
      : null;
  } catch {
    return null;
  }
};

/**
 * `/api/collab/:fileId`: one WebSocket per open editor. JSON messages in both directions: sdkjs's
 * own (see session.ts) and ours, prefixed `schreibzeug:`.
 */
export const collabRoutes = ({ hub, upgradeWebSocket }: { hub: Hub; upgradeWebSocket: UpgradeWebSocket }) =>
  new Hono<AuthEnv>().get(
    "/collab/:fileId",
    upgradeWebSocket((c) => {
      const fileId = c.req.param("fileId") ?? "";
      // Checked by requireUser before the upgrade: the WebSocket carries the session cookie.
      const { id, name } = c.var.user;
      let connectionId: Promise<string | null> = Promise.resolve(null);
      const send = (ws: WSContext) => (message: Record<string, unknown>) => ws.send(JSON.stringify(message));
      return {
        onOpen: (_event, ws) => {
          if (!nodeIdSchema.safeParse(fileId).success) {
            ws.close(CLOSE.notFound, "Unknown file");
            return;
          }
          const close = (code: number, reason: string) => ws.close(code, reason);
          connectionId = hub.open(fileId, { id, name }, send(ws), close).then((connection) => {
            if (connection === null) ws.close(CLOSE.notFound, "Unknown file");
            return connection;
          });
        },
        onMessage: async (event, ws) => {
          const id = await connectionId;
          if (id === null) return;
          const data = parse(event.data);
          if (!data) {
            ws.close(CLOSE.badMessage, "Not a message");
            return;
          }
          hub.message(id, data);
        },
        onClose: async () => {
          const id = await connectionId;
          if (id !== null) hub.close(id);
        },
      };
    }),
  );
