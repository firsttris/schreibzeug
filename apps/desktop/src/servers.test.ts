import { describe, expect, it } from "vitest";
import { MAX_RECENT, readRecent, remember, serverUrl } from "./servers";

describe("server addresses", () => {
  it("completes what is typed", () => {
    expect(serverUrl("stapel.example.org")).toBe("https://stapel.example.org");
    expect(serverUrl(" https://stapel.example.org/ ")).toBe("https://stapel.example.org");
    expect(serverUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(serverUrl("192.168.1.20:3000")).toBe("http://192.168.1.20:3000");
    expect(serverUrl("http://nas.local:3000/stapel")).toBe("http://nas.local:3000/stapel");
  });

  it("opens only web addresses", () => {
    expect(serverUrl("")).toBeNull();
    expect(serverUrl("file:///etc/passwd")).toBeNull();
    expect(serverUrl("javascript://alert(1)")).toBeNull();
  });

  it("keeps the last servers, the newest first", () => {
    const many = Array.from({ length: MAX_RECENT }, (_, index) => `https://s${index}.example.org`);
    expect(remember(many, "https://s3.example.org")[0]).toBe("https://s3.example.org");
    expect(remember(many, "https://new.example.org")).toHaveLength(MAX_RECENT);
    expect(readRecent('["https://a.example.org", 3, "file:///x"]')).toEqual(["https://a.example.org"]);
    expect(readRecent("not json")).toEqual([]);
  });
});
