import { nodeSchema } from "@schreibzeug/files-api";
import { describe, expect, it } from "vitest";
import { expectBytes, expectJson, isApiFailure, messageOf } from "./client";

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const node = {
  id: "8c2a5f8e-6a43-4f0b-9a55-0d6f0a3b1e11",
  parentId: null,
  kind: "file",
  name: "Brief.docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 10,
  version: 1,
  createdAt: "2026-10-23T14:00:00.000Z",
  updatedAt: "2026-10-23T14:00:00.000Z",
  trashedAt: null,
  role: "owner",
};

describe("expectJson", () => {
  it("returns a body that matches the schema", async () => {
    expect(await expectJson(reply(200, node), nodeSchema)).toEqual(node);
  });

  it("refuses a body that does not, so drift between server and client is loud", async () => {
    await expect(expectJson(reply(200, { ...node, kind: "link" }), nodeSchema)).rejects.toThrow();
  });

  it("turns the server's error into an ApiFailure with its kind and message", async () => {
    const error = await expectJson(
      reply(409, { error: { kind: "name_taken", message: "Name vergeben." } }),
      nodeSchema,
    ).catch((caught: unknown) => caught);
    expect(isApiFailure(error)).toBe(true);
    expect(error).toMatchObject({ status: 409, error: { kind: "name_taken" } });
    expect(messageOf(error)).toBe("Name vergeben.");
  });

  it("explains a reply that is no API error at all", async () => {
    const error = await expectJson(
      Promise.resolve(new Response("Bad Gateway", { status: 502 })),
      nodeSchema,
    ).catch((caught: unknown) => caught);
    expect(messageOf(error)).toBe("Der Server antwortet nicht wie erwartet (HTTP 502).");
  });
});

describe("expectBytes", () => {
  it("returns the bytes of a successful reply", async () => {
    const bytes = await expectBytes(Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});

describe("messageOf", () => {
  it("says the server is unreachable when fetch itself failed", () => {
    expect(messageOf(new TypeError("Failed to fetch"))).toBe("Der Server ist nicht erreichbar.");
  });
});
