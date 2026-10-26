import { nodeSchema } from "@schreibzeug/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, clientAddressOf, markClientAddress } from "../src/auth/client-ip";
import { AUTH_BODY_BYTES, DEFAULT_BODY_BYTES } from "../src/limits";
import { startServer, type TestServer } from "./harness";
import { tokenFor } from "./mcp-client";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server?.stop());

const jsonOf = (bytes: number) => JSON.stringify({ padding: "x".repeat(bytes) });

describe("body limits", () => {
  it("answers 413 to a large body for Better Auth before anyone is signed in", async () => {
    const reply = await server.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonOf(AUTH_BODY_BYTES),
    });
    expect(reply.status).toBe(413);
    expect(await reply.json()).toMatchObject({ error: { kind: "too_large" } });
  });

  it("answers 413 to a JSON body beyond the default limit on the other routes", async () => {
    const cookie = await server.signUp("Rita");
    const reply = await server.app.request("/api/folders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: jsonOf(DEFAULT_BODY_BYTES),
    });
    expect(reply.status).toBe(413);
  });

  it("leaves the uploads to their own limit", async () => {
    const cookie = await server.signUp("Sven");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(1024)], "klein.bin"));
    const reply = await server.app.request("/api/files", { method: "POST", headers: { cookie }, body: form });
    expect(reply.status).toBe(201);
  });
});

describe("the address the sign-in rate limit counts", () => {
  it("is the connection's peer, not a header the client sends", () => {
    expect(clientAddressOf("198.51.100.1", "203.0.113.5", false)).toBe("203.0.113.5");
    expect(clientAddressOf(null, undefined, false)).toBeNull();
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      headers: { [CLIENT_IP_HEADER]: "198.51.100.1" },
    });
    expect(markClientAddress(request, undefined, []).headers.has(CLIENT_IP_HEADER)).toBe(false);
  });

  it("is the forwarded chain with the peer at its end behind trusted proxies", () => {
    expect(clientAddressOf("198.51.100.1", "10.0.0.2", true)).toBe("198.51.100.1, 10.0.0.2");
    expect(clientAddressOf(null, "203.0.113.5", true)).toBe("203.0.113.5");
  });

  it("keeps the limit for a client that changes X-Forwarded-For, and apart from other clients", async () => {
    const limited = await startServer({ rateLimit: true });
    try {
      const signIn = (peer: string, forwardedFor: string) =>
        limited.app.request(
          markClientAddress(
            new Request("http://localhost/api/auth/sign-in/email", {
              method: "POST",
              headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
              body: JSON.stringify({ email: "niemand@example.org", password: "falsch-geraten" }),
            }),
            peer,
            [],
          ),
        );
      const statuses: number[] = [];
      for (const forwardedFor of ["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.4"]) {
        statuses.push((await signIn("203.0.113.5", forwardedFor)).status);
      }
      expect(statuses.at(-1)).toBe(429);
      expect((await signIn("203.0.113.6", "192.0.2.4")).status).not.toBe(429);
    } finally {
      await limited.stop();
    }
  });
});

describe("the origin of what changes something with a session", () => {
  const SIBLING = "http://evil.localhost";
  const createFolder = (headers: Record<string, string>, name: string) =>
    server.app.request("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ name, parentId: null }),
    });
  const upgrade = (path: string, headers: Record<string, string>) =>
    server.app.request(path, { headers: { upgrade: "websocket", connection: "Upgrade", ...headers } });

  it("lets the server's own pages and clients without a page through", async () => {
    const cookie = await server.signUp("Tara");
    expect((await createFolder({ cookie, origin: "http://localhost" }, "Eigene Seite")).status).toBe(201);
    expect((await createFolder({ cookie, "sec-fetch-site": "same-origin" }, "Ohne Origin")).status).toBe(201);
    expect((await createFolder({ cookie }, "Skript")).status).toBe(201);
  });

  it("refuses another origin of the same site, also for the WebSocket upgrades", async () => {
    const cookie = await server.signUp("Ulf");
    const folder = nodeSchema.parse(await (await createFolder({ cookie }, "Bleibt")).json());
    const trash = await server.app.request(`/api/nodes/${folder.id}/trash`, {
      method: "POST",
      headers: { cookie, origin: SIBLING },
    });
    expect(trash.status).toBe(403);
    expect(await trash.json()).toMatchObject({ error: { kind: "forbidden" } });
    expect((await createFolder({ cookie, "sec-fetch-site": "same-site" }, "Fremd")).status).toBe(403);
    expect((await createFolder({ cookie, origin: "null" }, "Fremd")).status).toBe(403);
    for (const path of [`/api/collab/${folder.id}`, `/api/agent/${folder.id}`]) {
      expect((await upgrade(path, { cookie, origin: SIBLING })).status).toBe(403);
      expect((await upgrade(path, { cookie, origin: "http://localhost" })).status).not.toBe(403);
    }
    // Reading is not refused: another origin cannot read the answer anyway (no CORS).
    expect((await server.app.request("/api/nodes", { headers: { cookie, origin: SIBLING } })).status).toBe(
      200,
    );
  });

  it("trusts the configured origins, and does not ask tokens where they come from", async () => {
    const trusting = await startServer({ trustedOrigins: ["tauri://localhost"] });
    try {
      const cookie = await trusting.signUp("Vera");
      const reply = await trusting.app.request("/api/folders", {
        method: "POST",
        headers: { cookie, origin: "tauri://localhost", "content-type": "application/json" },
        body: JSON.stringify({ name: "Desktop", parentId: null }),
      });
      expect(reply.status).toBe(201);
    } finally {
      await trusting.stop();
    }
    const cookie = await server.signUp("Wim");
    const token = await tokenFor(server, cookie, "write");
    const reply = await createFolder({ authorization: `Bearer ${token}`, origin: SIBLING }, "Mit Schlüssel");
    expect(reply.status).toBe(201);
  });
});
