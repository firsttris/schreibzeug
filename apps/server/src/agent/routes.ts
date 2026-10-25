import { zValidator } from "@hono/zod-validator";
import { agentCommandSchema, agentReplySchema, nodeIdSchema } from "@schreibzeug/files-api";
import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { z } from "zod";
import type { AuthEnv } from "../auth/middleware";
import type { Database } from "../db/database";
import { requireFile } from "../files/repository";
import { statusOf } from "../result";
import type { AgentHub } from "./hub";

const idParam = z.object({ id: nodeIdSchema });

/** Validation failures in the same shape as every other API error. */
const validate = <T extends "json" | "param", S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Ungültige Anfrage.";
      return c.json({ error: { kind: "invalid" as const, message } }, 400);
    }
  });

/**
 * The jobs API (hub.ts): `POST /files/:id/agent` runs a command in the open tab and answers what it
 * answered; `GET /files/:id/outline` asks for the outline, which a read-only token may too. Both
 * check the role first, as any change would be checked: "edit" to change, "view" to look.
 */
export const agentRoutes = ({ db, hub }: { db: Database; hub: AgentHub }) =>
  new Hono<AuthEnv>()
    .post(
      "/files/:id/agent",
      validate("param", idParam),
      validate("json", z.object({ command: agentCommandSchema })),
      async (c) => {
        const { id } = c.req.valid("param");
        const { command } = c.req.valid("json");
        const access = requireFile(db, c.var.user.id, id, command.type === "outline" ? "view" : "edit");
        if (!access.ok) return c.json({ error: access.error }, statusOf(access.error.kind));
        const result = await hub.dispatch(c.var.user.id, id, command);
        return result.ok
          ? c.json({ text: result.value })
          : c.json({ error: result.error }, statusOf(result.error.kind));
      },
    )
    .get("/files/:id/outline", validate("param", idParam), async (c) => {
      const { id } = c.req.valid("param");
      const access = requireFile(db, c.var.user.id, id, "view");
      if (!access.ok) return c.json({ error: access.error }, statusOf(access.error.kind));
      const result = await hub.dispatch(c.var.user.id, id, { type: "outline" });
      return result.ok
        ? c.json({ text: result.value })
        : c.json({ error: result.error }, statusOf(result.error.kind));
    });

const parse = (data: unknown) => {
  if (typeof data !== "string") return null;
  try {
    const parsed = agentReplySchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * `/agent/:fileId`: the WebSocket an editor opens when it has a document open for editing, to take
 * jobs for it. Only with a session (app.ts) and the right to edit the file.
 */
export const agentSocketRoutes = ({
  db,
  hub,
  upgradeWebSocket,
}: {
  db: Database;
  hub: AgentHub;
  upgradeWebSocket: UpgradeWebSocket;
}) =>
  new Hono<AuthEnv>().get(
    "/agent/:fileId",
    upgradeWebSocket((c) => {
      const fileId = c.req.param("fileId") ?? "";
      const userId = c.var.user.id;
      let tabId: string | null = null;
      return {
        onOpen: (_event, ws) => {
          const valid = nodeIdSchema.safeParse(fileId).success;
          if (!valid || !requireFile(db, userId, fileId, "edit").ok) {
            ws.close(4404, "Unknown file");
            return;
          }
          tabId = hub.join(userId, fileId, (job) => ws.send(JSON.stringify(job)));
        },
        onMessage: (event) => {
          const reply = parse(event.data);
          if (tabId && reply) hub.reply(tabId, reply);
        },
        onClose: () => {
          if (tabId) hub.leave(tabId);
        },
      };
    }),
  );
