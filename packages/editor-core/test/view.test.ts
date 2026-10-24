import { describe, expect, it } from "vitest";
import { clampZoom, createListeners, createViewCommands, toContextMenuRequest } from "../src/view";
import { createFakeEngine } from "./fake-engine";

const setup = () => {
  const engine = createFakeEngine();
  const api = new engine.window.Asc.asc_docs_api({});
  return { commands: createViewCommands(api), calls: engine.api().calls };
};

describe("view commands", () => {
  it("copies and cuts through the engine and reports when the browser refused", () => {
    const { commands, calls } = setup();
    expect(commands.clipboard("copy")).toBe(true);
    expect(commands.clipboard("cut")).toBe(true);
    expect(commands.clipboard("paste")).toBe(false);
    expect(calls.slice(-3).map(([name]) => name)).toEqual(["Copy", "Cut", "Paste"]);
  });

  it("zooms within the range the menus offer", () => {
    const { commands, calls } = setup();
    commands.setZoom(1000);
    expect(calls.at(-1)).toEqual(["zoom", 500]);
    commands.setZoom(3);
    expect(calls.at(-1)).toEqual(["zoom", 25]);
    expect(clampZoom(99.6)).toBe(100);
  });
});

describe("toContextMenuRequest", () => {
  const data = (type: number) => ({ get_Type: () => type, get_X: () => 30, get_Y: () => 40 });

  it("places the menu in frame coordinates, from the point in the engine's view", () => {
    const view = { getBoundingClientRect: () => ({ left: 100, top: 20 }) };
    expect(toContextMenuRequest(data(0), view, 1)).toEqual({ x: 130, y: 60, area: "body" });
  });

  it("tells a click in a header or footer apart", () => {
    expect(toContextMenuRequest(data(1), null, 1).area).toBe("headerFooter");
  });
});

describe("createListeners", () => {
  it("calls every listener until it unsubscribes", () => {
    const listeners = createListeners<number>();
    const seen: number[] = [];
    const stop = listeners.add((value) => seen.push(value));
    listeners.emit(1);
    stop();
    listeners.emit(2);
    expect(seen).toEqual([1]);
  });
});
