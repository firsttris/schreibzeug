import type { Storage } from "@schreibzeug/files-api";
import { describe, expect, it } from "vitest";
import { diskLevel, freeText, isLow } from "./storage";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const storage = (free: number, total = 100 * GB): Storage => ({
  usage: null,
  disk: { free, total },
  uploadLimit: 512 * MB,
});

describe("diskLevel", () => {
  it.each([
    [50 * GB, 50, "normal"],
    [20 * GB, 80, "warn"],
    [5 * GB, 95, "full"],
  ])("with %d bytes free is %d %% used, %s", (free, percent, tone) => {
    expect(diskLevel({ free, total: 100 * GB })).toEqual({ percent, tone });
  });

  it("reads a drive the system calls empty as empty, not as broken", () => {
    expect(diskLevel({ free: 0, total: 0 })).toEqual({ percent: 0, tone: "normal" });
  });
});

describe("isLow", () => {
  it("is low below 1 GB free, on a small drive as on a large one", () => {
    expect(isLow(storage(900 * MB, 2 * GB))).toBe(true);
    expect(isLow(storage(900 * MB, 4000 * GB))).toBe(true);
    expect(isLow(storage(2 * GB, 4 * GB))).toBe(false);
  });

  it("is low once less is free than the largest file the server takes", () => {
    expect(isLow({ ...storage(1.5 * GB), uploadLimit: 2 * GB })).toBe(true);
  });

  it("is not low on a large drive that is 98 % full but holds plenty", () => {
    expect(isLow(storage(20 * GB, 1000 * GB))).toBe(false);
  });

  it("says nothing when the system does not name the room", () => {
    expect(isLow({ ...storage(0), disk: null })).toBe(false);
  });
});

describe("freeText", () => {
  it("names the room left and the drive's size", () => {
    expect(freeText({ free: 38.2 * GB, total: 80 * GB })).toBe("38,2 GB frei von 80 GB");
  });
});
