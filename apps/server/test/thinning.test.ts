import { describe, expect, it } from "vitest";
import { BLOB_GRACE_MS, unusedBlobs } from "../src/blob-collection";
import { type VersionStamp, versionsToThin } from "../src/files/thinning";

const NOW = new Date("2026-10-27T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Versions numbered from the oldest, each `ago` milliseconds before NOW. */
const stamps = (...ago: number[]): VersionStamp[] =>
  ago.map((age, index) => ({ number: index + 1, createdAt: new Date(NOW.getTime() - age), kept: false }));

describe("versionsToThin", () => {
  it("keeps every version of the last day", () => {
    expect(versionsToThin(stamps(23 * HOUR, 5 * HOUR, 60_000, 1000), NOW)).toEqual([]);
  });

  it("keeps the newest version per hour up to a month", () => {
    // 2 and 3 are in the same hour two days ago, 1 an hour earlier.
    const day2 = 2 * DAY + 30 * 60_000;
    expect(versionsToThin(stamps(day2 + HOUR, day2 + 60_000, day2, 1000), NOW)).toEqual([2]);
  });

  it("keeps the newest version per day up to a year and per week after that", () => {
    const month = 40 * DAY;
    const years = 3 * 365 * DAY;
    expect(versionsToThin(stamps(years + 60_000, years, month + HOUR, month, 1000), NOW)).toEqual(
      expect.arrayContaining([3]),
    );
    expect(versionsToThin(stamps(years + 60_000, years, 1000), NOW)).toEqual([1]);
  });

  it("never drops a kept version or the newest", () => {
    // Within one hour ten days ago (NOW is on the full hour).
    const old = 10 * DAY - 30 * 60_000;
    const [first, second, third] = stamps(old + 2000, old + 1000, old);
    if (!first || !second || !third) throw new Error("three stamps");
    expect(versionsToThin([{ ...first, kept: true }, second, third], NOW)).toEqual([2]);
    expect(versionsToThin([first, second, third], NOW)).toEqual([2, 1]);
  });
});

describe("unusedBlobs", () => {
  const old = new Date(NOW.getTime() - BLOB_GRACE_MS - 1000);
  const young = new Date(NOW.getTime() - 1000);

  it("takes only old blobs that nothing refers to", () => {
    const blobs = [
      { sha256: "a", storedAt: old },
      { sha256: "b", storedAt: old },
      { sha256: "c", storedAt: young },
    ];
    expect(unusedBlobs(blobs, new Set(["b"]), NOW)).toEqual(["a"]);
  });
});
