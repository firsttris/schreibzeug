import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTH_BODY_BYTES, DEFAULT_BODY_BYTES } from "../src/limits";
import { startServer, type TestServer } from "./harness";

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
