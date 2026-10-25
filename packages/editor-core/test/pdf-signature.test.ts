import { describe, expect, it } from "vitest";
import { boundsOf, inkPaths, SIGNATURE_HEIGHT, SIGNATURE_WIDTH, signaturePlace } from "../src/pdf-signature";

const zigzag = [
  [
    { x: 40, y: 110 },
    { x: 80, y: 40 },
  ],
  [
    { x: 120, y: 120 },
    { x: 240, y: 70 },
  ],
];

describe("boundsOf", () => {
  it("spans all strokes and is null without points", () => {
    expect(boundsOf(zigzag)).toEqual({ x1: 40, y1: 40, x2: 240, y2: 120 });
    expect(boundsOf([[]])).toBeNull();
  });
});

describe("signaturePlace", () => {
  it("centres the signature at its width in the part of the page in view", () => {
    const place = signaturePlace(
      { width: 595, height: 842 },
      { x: 0, y: 0, r: 1, b: 0.5 },
      { x1: 40, y1: 40, x2: 240, y2: 120 },
    );
    expect(place.x2 - place.x1).toBe(SIGNATURE_WIDTH);
    expect(place.y2 - place.y1).toBeCloseTo(SIGNATURE_WIDTH * (80 / 200));
    expect((place.x1 + place.x2) / 2).toBe(297.5);
    expect((place.y1 + place.y2) / 2).toBe(210.5);
  });

  it("stays narrower than a small page", () => {
    const place = signaturePlace(
      { width: 100, height: 100 },
      { x: 0, y: 0, r: 1, b: 1 },
      { x1: 0, y1: 0, x2: 10, y2: 5 },
    );
    expect(place.x2 - place.x1).toBe(80);
  });

  it("keeps a tall drawing at the signature height, with its proportions", () => {
    const place = signaturePlace(
      { width: 595, height: 842 },
      { x: 0, y: 0, r: 1, b: 1 },
      { x1: 0, y1: 0, x2: 10, y2: 200 },
    );
    expect(place.y2 - place.y1).toBeCloseTo(SIGNATURE_HEIGHT);
    expect(place.x2 - place.x1).toBeCloseTo(SIGNATURE_HEIGHT / 20);
  });

  it("gives a single straight stroke a small box", () => {
    const a4 = { width: 595, height: 842 };
    const whole = { x: 0, y: 0, r: 1, b: 1 };
    const vertical = signaturePlace(a4, whole, { x1: 50, y1: 0, x2: 50, y2: 100 });
    expect(vertical.y2 - vertical.y1).toBeCloseTo(SIGNATURE_HEIGHT);
    expect(vertical.x2 - vertical.x1).toBe(2);
    const horizontal = signaturePlace(a4, whole, { x1: 0, y1: 30, x2: 100, y2: 30 });
    expect(horizontal.x2 - horizontal.x1).toBeCloseTo(SIGNATURE_WIDTH);
    expect(horizontal.y2 - horizontal.y1).toBe(2);
  });
});

describe("inkPaths", () => {
  it("moves and scales every stroke into the place as flat x, y pairs", () => {
    const drawing = { x1: 40, y1: 40, x2: 240, y2: 120 };
    const place = { x1: 100, y1: 200, x2: 200, y2: 240 };
    expect(inkPaths([...zigzag, []], drawing, place)).toEqual([
      [100, 235, 120, 200],
      [140, 240, 200, 215],
    ]);
  });

  it("puts a straight stroke in the middle of its place", () => {
    const drawing = { x1: 50, y1: 0, x2: 50, y2: 100 };
    const place = signaturePlace({ width: 595, height: 842 }, { x: 0, y: 0, r: 1, b: 1 }, drawing);
    const [path] = inkPaths(
      [
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
      drawing,
      place,
    );
    expect(path?.[0]).toBeCloseTo(297.5);
    expect(path?.[1]).toBeCloseTo(place.y1);
    expect(path?.[3]).toBeCloseTo(place.y2);
  });
});
