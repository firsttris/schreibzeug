import { afterEach, describe, expect, it, vi } from "vitest";
import { printPages, printScale, printStyle, printsPdfInFrame } from "./print-pages";

const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const BRAVE_ANDROID =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0";

describe("printsPdfInFrame", () => {
  it.each([
    ["Chrome on a computer", CHROME_LINUX, true, true],
    ["Firefox", FIREFOX, true, true],
    ["Chrome-based browsers on Android, without a PDF viewer", BRAVE_ANDROID, false, false],
    ["Safari, whose viewer draws the pages too late", SAFARI_MAC, true, false],
    ["any browser on iOS, which is WebKit", CHROME_IOS, true, false],
    ["a browser that does not say", CHROME_LINUX, undefined, false],
  ] as const)("%s", (_, userAgent, pdfViewerEnabled, expected) => {
    expect(printsPdfInFrame({ userAgent, pdfViewerEnabled })).toBe(expected);
  });
});

describe("printScale", () => {
  it("draws an A4 page at 300 dpi", () => {
    expect(printScale(595, 842)).toBeCloseTo(300 / 72);
  });

  it("keeps a large page within 16 million pixels", () => {
    const scale = printScale(1684, 2384); // A1
    expect(1684 * scale * 2384 * scale).toBeLessThanOrEqual(16_000_001);
  });
});

describe("printStyle", () => {
  it("prints only the pages, one per sheet at the page's size", () => {
    const css = printStyle({ width: 842, height: 595 });
    expect(css).toContain("@page { size: 842pt 595pt; margin: 0; }");
    expect(css).toContain("body > :not(#print-pages) { display: none !important; }");
    expect(css).toContain("@media screen { #print-pages { display: none; } }");
  });
});

describe("printPages", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const page = { image: new Blob(["png"], { type: "image/png" }), width: 595, height: 842 };

  /** A window whose print dialog is the given function. */
  const windowWith = (print: () => void) => {
    const events = new EventTarget();
    return {
      document,
      print: vi.fn(print),
      addEventListener: events.addEventListener.bind(events),
      dispatch: (type: string) => events.dispatchEvent(new Event(type)),
    };
  };

  const stubDecode = () => {
    const decoded: string[] = [];
    vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(function (this: HTMLImageElement) {
      decoded.push(this.src);
      return Promise.resolve();
    });
    return decoded;
  };

  it("opens the dialog once every page is decoded, and clears up afterwards", async () => {
    const decoded = stubDecode();
    const win = windowWith(() => {
      expect(decoded).toHaveLength(2);
      expect(document.querySelectorAll("#print-pages img")).toHaveLength(2);
    });
    await printPages(win, [page, page]);
    expect(win.print).toHaveBeenCalledOnce();
    win.dispatch("afterprint");
    expect(document.querySelector("#print-pages")).toBeNull();
    expect(document.querySelector("#print-pages-style")).toBeNull();
  });

  it("replaces the pages of an earlier print the browser never finished", async () => {
    stubDecode();
    const win = windowWith(() => {});
    await printPages(win, [page, page]);
    await printPages(win, [page]);
    expect(document.querySelectorAll("#print-pages")).toHaveLength(1);
    expect(document.querySelectorAll("#print-pages img")).toHaveLength(1);
    expect(document.querySelectorAll("#print-pages-style")).toHaveLength(1);
  });

  it("takes the pages away again when a picture cannot be decoded", async () => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValue(new DOMException("decode", "EncodingError"));
    const win = windowWith(() => {});
    await expect(printPages(win, [page])).rejects.toThrow("decode");
    expect(win.print).not.toHaveBeenCalled();
    expect(document.querySelector("#print-pages")).toBeNull();
    expect(document.querySelector("#print-pages-style")).toBeNull();
  });

  it("prints nothing for a PDF without pages", async () => {
    const win = windowWith(() => {});
    await printPages(win, []);
    expect(win.print).not.toHaveBeenCalled();
  });
});
