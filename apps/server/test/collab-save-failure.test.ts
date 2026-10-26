import { Database as SQLite } from "bun:sqlite";
import { join } from "node:path";
import { nodeSchema, SESSION_SAVE_HEADER } from "@schreibzeug/files-api";
import type { UpgradeWebSocket } from "hono/ws";
import { describe, expect, it } from "vitest";
import { createHub } from "../src/collab/hub";
import { startServer } from "./harness";

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("a save from a shared session that fails while it is stored", () => {
  it("lets the session end once its last connection closes", async () => {
    const hub = createHub({ access: async () => ({ version: 1, role: "owner" }) });
    const upgradeWebSocket = (() => () => new Response(null, { status: 426 })) as unknown as UpgradeWebSocket;
    const server = await startServer({ collab: { hub, upgradeWebSocket } });
    try {
      const anna = await server.signUp("Anna");
      const form = new FormData();
      form.set("file", new File([bytesOf("x")], "geteilt.docx"));
      const created = await server.app.request("/api/files", {
        method: "POST",
        body: form,
        headers: { cookie: anna },
      });
      const file = nodeSchema.parse(await created.json());

      const a = (await hub.open(file.id, { id: "anna", name: "Anna" }, () => {})) as string;
      hub.message(a, { type: "auth", user: { id: "anna" } });
      expect(hub.session(file.id)?.baseVersion).toBe(1);

      // Another process holds SQLite's write lock (a backup, the sqlite3 shell) past busy_timeout:
      // addVersion throws "database is locked".
      const other = new SQLite(join(server.dataDir, "schreibzeug.db"));
      other.exec("BEGIN IMMEDIATE");
      const put = await server.app.request(`/api/files/${file.id}/content`, {
        method: "PUT",
        body: bytesOf("neu"),
        headers: { cookie: anna, [SESSION_SAVE_HEADER]: "1:0" },
      });
      other.exec("ROLLBACK");
      other.close();
      expect(put.status).toBe(500);

      hub.close(a); // nothing in the log, nobody left: the session ends
      expect.soft(hub.session(file.id)).toBeUndefined();

      // And every later session of the file, too.
      const b = (await hub.open(file.id, { id: "anna", name: "Anna" }, () => {})) as string;
      hub.close(b);
      expect(hub.session(file.id)).toBeUndefined();
    } finally {
      await server.stop();
    }
  }, 20_000);
});
