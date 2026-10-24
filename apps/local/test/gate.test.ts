import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COOKIE, isLoopback } from "../src/gate";
import { type Local, startLocal, TOKEN } from "./harness";

let local: Local;
beforeEach(async () => {
  local = await startLocal();
});
afterEach(() => local.stop());

describe("the gate in front of the local server", () => {
  it("knows the loopback names", () => {
    expect(isLoopback("127.0.0.1:4123")).toBe(true);
    expect(isLoopback("localhost")).toBe(true);
    expect(isLoopback("[::1]:80")).toBe(true);
    expect(isLoopback("evil.example:4123")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it("refuses a request without the cookie", async () => {
    const response = await local.app.request("/api/nodes");
    expect(response.status).toBe(401);
  });

  it("unlocks with the token and goes on to the app", async () => {
    const response = await local.app.request(`/api/local/unlock?token=${TOKEN}&to=/edit/x`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/edit/x");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${COOKIE}=${TOKEN}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("does not unlock with a wrong token, nor redirect to another site", async () => {
    expect((await local.app.request("/api/local/unlock?token=falsch")).status).toBe(401);
    const away = await local.app.request(`/api/local/unlock?token=${TOKEN}&to=//evil.example`);
    expect(away.headers.get("location")).toBe("/");
  });

  it("turns away a foreign host name, even with the cookie (DNS rebinding)", async () => {
    const response = await local.request("http://evil.example/api/nodes");
    expect(response.status).toBe(403);
  });

  it("turns away a change from another site's page", async () => {
    const response = await local.request("/api/folders", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "X" }),
    });
    expect(response.status).toBe(403);
  });
});
