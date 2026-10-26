import { nodeSchema } from "@schreibzeug/files-api";
import type { UpgradeWebSocket } from "hono/ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHub, type FileAccess } from "../src/collab/hub";
import { ENGINE_CLOSE, SOCKET_CLOSE } from "../src/collab/limits";
import type { Database } from "../src/db/database";
import { roleOf } from "../src/files/access";
import { startServer, type TestServer } from "./harness";

const FILE = "8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11";
const auth = (user: string) => ({ type: "auth", user: { id: user } });
const save = (change: string) => ({
  type: "saveChanges",
  changes: JSON.stringify([change]),
  startSaveChanges: true,
  endSaveChanges: true,
});

/** A connection as the hub sees it: what it was sent, and how its socket closed. */
const socket = () => {
  const messages: Array<Record<string, unknown>> = [];
  const closed: Array<[number, string]> = [];
  return {
    messages,
    closed,
    send: (message: Record<string, unknown>) => messages.push(message),
    close: (code: number, reason: string) => closed.push([code, reason]),
  };
};

describe("checking open connections again", () => {
  const setup = () => {
    const roles = new Map<string, FileAccess["role"]>([
      ["anna", "owner"],
      ["ben", "edit"],
    ]);
    const hub = createHub({
      access: async (_fileId, userId) => {
        const role = roles.get(userId);
        return role ? { version: 1, role } : null;
      },
    });
    const join = async (user: string) => {
      const connection = socket();
      const id = (await hub.open(
        FILE,
        { id: user, name: user },
        connection.send,
        connection.close,
      )) as string;
      hub.message(id, auth(user));
      return { id, ...connection };
    };
    return { hub, roles, join };
  };

  it("sends away whoever lost the file: nothing more reaches them or comes from them", async () => {
    const { hub, roles, join } = setup();
    const anna = await join("anna");
    const ben = await join("ben");
    roles.delete("ben");
    await hub.revalidate();

    expect(ben.messages.at(-1)).toMatchObject({ type: "drop", code: ENGINE_CLOSE.accessDeny });
    expect(ben.closed).toEqual([[SOCKET_CLOSE.revoked, "Access revoked"]]);
    expect(anna.closed).toEqual([]);
    expect(hub.session(FILE)?.participants.map((p) => p.idOriginal)).toEqual(["anna"]);

    const seen = ben.messages.length;
    hub.message(anna.id, save("after"));
    hub.message(ben.id, save("injected"));
    expect(ben.messages).toHaveLength(seen);
    expect(hub.session(FILE)?.changes.map((c) => c.change)).toEqual(['"after"']);
  });

  it("sends away an editor who may now only look, to open the file again as a viewer", async () => {
    const { hub, roles, join } = setup();
    await join("anna");
    const ben = await join("ben");
    roles.set("ben", "view");
    await hub.revalidate();
    expect(ben.closed).toEqual([[SOCKET_CLOSE.revoked, "Access changed to view"]]);
  });

  it("leaves everyone else as they are", async () => {
    const { hub, join } = setup();
    const anna = await join("anna");
    const ben = await join("ben");
    await hub.revalidate();
    expect([anna.closed, ben.closed]).toEqual([[], []]);
    expect(hub.session(FILE)?.participants).toHaveLength(2);
  });
});

describe("a change to who may open what", () => {
  let server: TestServer;
  let db: Database;
  // The relay as main.ts builds it, against the test server's database.
  const hub = createHub({
    access: async (fileId, userId) => {
      const found = roleOf(db, userId, fileId);
      return found?.node.kind === "file" && found.node.version !== null
        ? { version: found.node.version, role: found.role }
        : null;
    },
  });
  const upgradeWebSocket = (() => () => new Response(null, { status: 426 })) as unknown as UpgradeWebSocket;

  beforeAll(async () => {
    server = await startServer({ collab: { hub, upgradeWebSocket } });
    db = server.db;
  });
  afterAll(() => server?.stop());

  const call = (path: string, cookie: string, method = "GET", body?: unknown) =>
    server.app.request(path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const userId = async (cookie: string) =>
    ((await (await call("/api/auth/get-session", cookie)).json()) as { user: { id: string } }).user.id;
  /** Lets the checks the route started finish. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 10));

  const sharedFile = async (prefix: string) => {
    const owner = await server.signUp(`${prefix}Owner`);
    const guest = await server.signUp(`${prefix}Guest`);
    const created = await call("/api/files/blank", owner, "POST", {
      name: "Brief",
      parentId: null,
      format: "docx",
    });
    const file = nodeSchema.parse(await created.json());
    const email = `${prefix.toLowerCase()}guest@example.org`;
    await call(`/api/nodes/${file.id}/shares`, owner, "PUT", { email, role: "edit" });
    const guestId = await userId(guest);
    const collab = socket();
    await hub.open(file.id, { id: guestId, name: "Guest" }, collab.send, collab.close);
    const tab = socket();
    server.agent.join(guestId, file.id, () => {}, tab.close);
    return { owner, file, email, guestId, collab, tab };
  };

  it("closes the editor sockets of someone whose share is removed", async () => {
    const { owner, file, guestId, collab, tab } = await sharedFile("R");
    await call(`/api/nodes/${file.id}/shares/${guestId}`, owner, "DELETE");
    await settled();
    expect(collab.closed).toEqual([[SOCKET_CLOSE.revoked, "Access revoked"]]);
    expect(tab.closed).toEqual([[SOCKET_CLOSE.revoked, "Access revoked"]]);
  });

  it("closes them when the share is lowered to view", async () => {
    const { owner, file, email, collab, tab } = await sharedFile("L");
    await call(`/api/nodes/${file.id}/shares`, owner, "PUT", { email, role: "view" });
    await settled();
    expect(collab.closed).toEqual([[SOCKET_CLOSE.revoked, "Access changed to view"]]);
    expect(tab.closed).toEqual([[SOCKET_CLOSE.revoked, "Access revoked"]]);
  });

  it("closes them when the file goes to the trash", async () => {
    const { owner, file, collab, tab } = await sharedFile("T");
    await call(`/api/nodes/${file.id}/trash`, owner, "POST");
    await settled();
    expect(collab.closed).toHaveLength(1);
    expect(tab.closed).toHaveLength(1);
  });
});
