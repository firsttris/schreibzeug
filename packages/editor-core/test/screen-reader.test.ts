import { describe, expect, it } from "vitest";
import type { EngineWindow } from "../src/engine-types";
import { followScreenReader, labelEngineInput, type ScreenReaderEvent } from "../src/screen-reader";

/** A frame window whose engine switches its speaker as Strg+Alt+Z does (workerspeech.js toggle). */
const fakeWindow = () => {
  const target = new EventTarget();
  const speaker = { isLanched: false };
  const win = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    AscCommon: { EditorActionSpeaker: speaker },
  } as unknown as EngineWindow;
  const pressStrgAltZ = () => {
    speaker.isLanched = !speaker.isLanched;
    target.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyZ", key: "z", ctrlKey: true, altKey: true }));
  };
  return { win, speaker, pressStrgAltZ };
};

const follow = (on: boolean) => {
  const { win, speaker, pressStrgAltZ } = fakeWindow();
  const enabled: boolean[] = [];
  const events: ScreenReaderEvent[] = [];
  const api = {
    setSpeechEnabled: (value: boolean) => {
      speaker.isLanched = value;
      enabled.push(value);
    },
  };
  const screenReader = followScreenReader(win, api, on, (event) => events.push(event));
  return { screenReader, enabled, events, pressStrgAltZ };
};

describe("followScreenReader", () => {
  it("leaves the engine's speaker off unless asked, so it listens to nothing", () => {
    const { enabled, events } = follow(false);
    expect(enabled).toEqual([false]);
    expect(events).toEqual([{ type: "screenReader", value: false }]);
  });

  it("switches it on from the start when the setting says so", () => {
    const { enabled, events } = follow(true);
    expect(enabled).toEqual([true]);
    expect(events).toEqual([{ type: "screenReader", value: true }]);
  });

  it("tells the store when Strg+Alt+Z switched it in the engine", () => {
    const { events, pressStrgAltZ } = follow(false);
    pressStrgAltZ();
    expect(events.at(-1)).toEqual({ type: "screenReader", value: true });
    pressStrgAltZ();
    expect(events.at(-1)).toEqual({ type: "screenReader", value: false });
  });

  it("switches it from the menu, and stops following the keys when the document closes", () => {
    const { screenReader, enabled, events, pressStrgAltZ } = follow(false);
    screenReader.set(true);
    expect(enabled.at(-1)).toBe(true);
    expect(events.at(-1)).toEqual({ type: "screenReader", value: true });
    screenReader.stop();
    const count = events.length;
    pressStrgAltZ();
    expect(events).toHaveLength(count);
  });
});

describe("labelEngineInput", () => {
  it("names the hidden input after the document and gives it a valid autocomplete", () => {
    const input = document.createElement("textarea");
    input.setAttribute("autocomplete", "extremely_off");
    labelEngineInput(input, "Angebot.docx");
    expect(input.getAttribute("aria-label")).toBe("Angebot.docx");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
});
