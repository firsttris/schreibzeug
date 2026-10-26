import { nodeSchema, SESSION_SAVE_HEADER } from "@schreibzeug/files-api";
import type { UpgradeWebSocket } from "hono/ws";
import { describe, expect, it } from "vitest";
import { createHub } from "../src/collab/hub";
import { startServer } from "./harness";

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("a save after a server restart", () => {
  it("stores the only copy that holds the session's changes", async () => {
    const access = async () => ({ version: 1, role: "owner" as const });
    let current = createHub({ access });
    // Delegates to the hub of the running process; a restart replaces it (sessions live in memory).
    // biome-ignore lint/suspicious/noExplicitAny: runs against main too, where begin/abandon do not exist
    const any = () => current as any;
    const hub = {
      open: (...a: unknown[]) => any().open(...a),
      message: (...a: unknown[]) => any().message(...a),
      close: (...a: unknown[]) => any().close(...a),
      begin: (...a: unknown[]) => any().begin(...a),
      stored: (...a: unknown[]) => any().stored(...a),
      abandon: (...a: unknown[]) => any().abandon(...a),
      session: (...a: unknown[]) => any().session(...a),
    } as unknown as ReturnType<typeof createHub>;
    const upgradeWebSocket = (() => () => new Response(null, { status: 426 })) as unknown as UpgradeWebSocket;
    const server = await startServer({ collab: { hub, upgradeWebSocket } });
    try {
      const anna = await server.signUp("Anna");
      const form = new FormData();
      form.set("file", new File([bytesOf("v1")], "geteilt.docx"));
      const created = await server.app.request("/api/files", {
        method: "POST",
        body: form,
        headers: { cookie: anna },
      });
      const file = nodeSchema.parse(await created.json());

      // Anna edits alone: one change in the log, not saved yet.
      const a = (await hub.open(file.id, { id: "anna", name: "Anna" }, () => {})) as string;
      hub.message(a, { type: "auth", user: { id: "anna" } });
      hub.message(a, {
        type: "saveChanges",
        changes: '["c1"]',
        startSaveChanges: true,
        endSaveChanges: true,
      });
      expect(hub.session(file.id)?.changes.length).toBe(1);

      // The server restarts: the relay's memory is gone; Anna's socket has not come back (yet, or
      // ever: the channel stops after 20 attempts, editor-core collab.ts).
      current = createHub({ access });

      // Anna presses Ctrl+S: her engine's copy is the only one holding change c1.
      const put = await server.app.request(`/api/files/${file.id}/content`, {
        method: "PUT",
        body: bytesOf("v1+c1"),
        headers: { cookie: anna, [SESSION_SAVE_HEADER]: "1:1" },
      });
      expect(put.status).toBe(200);
      const content = await server.app.request(`/api/files/${file.id}/content`, {
        headers: { cookie: anna },
      });
      expect(await content.text()).toBe("v1+c1");
    } finally {
      await server.stop();
    }
  }, 20_000);
});
