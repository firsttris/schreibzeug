import { zValidator } from "@hono/zod-validator";
import { createAccessTokenSchema, nodeIdSchema } from "@schreibzeug/files-api";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/database";
import { statusOf } from "../result";
import { type AuthEnv, requireSession } from "./middleware";
import { createToken, listTokens, revokeToken, toAccessToken } from "./tokens";

const invalid = zValidator("json", createAccessTokenSchema, (result, c) => {
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Ungültige Anfrage.";
    return c.json({ error: { kind: "invalid" as const, message } }, 400);
  }
});

/**
 * `/api/tokens`: the signed-in user's personal access tokens (Einstellungen → Zugangsschlüssel).
 * Only with a session: a token cannot make or see tokens.
 */
export const tokenRoutes = ({ db }: { db: Database }) =>
  new Hono<AuthEnv>()
    .use("/tokens/*", requireSession)
    .use("/tokens", requireSession)
    .get("/tokens", (c) => c.json(listTokens(db, c.var.user.id).map(toAccessToken)))
    .post("/tokens", invalid, (c) => {
      const { row, token } = createToken(db, c.var.user.id, c.req.valid("json"));
      return c.json({ ...toAccessToken(row), token }, 201);
    })
    .delete("/tokens/:id", zValidator("param", z.object({ id: nodeIdSchema })), (c) => {
      const revoked = revokeToken(db, c.var.user.id, c.req.valid("param").id);
      return revoked.ok ? c.json(null) : c.json({ error: revoked.error }, statusOf(revoked.error.kind));
    });
