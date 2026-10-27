import { describe, expect, it } from "vitest";
import { createMobileViewCommands, onPages } from "../src/word-mobile-view";

/** The engine's switch between pages and the mobile view, with what was called in order. */
const fakeApi = (reader = false) => {
  const calls: string[] = [];
  let mode = reader;
  return {
    calls,
    api: {
      ChangeReaderMode: () => {
        mode = !mode;
        calls.push(mode ? "mobile view" : "pages");
      },
      asc_SetViewRulers: (show: boolean) => calls.push(show ? "rulers" : "no rulers"),
      zoomFitToWidth: () => calls.push("fit width"),
      WordControl: {
        IsReaderMode: () => mode,
        m_oLogicDocument: {
          RecalculateAllAtOnce: () => calls.push("lay out"),
          Get_MailMergedDocument: () => null,
          FieldsManager: { GetAllFieldsByType: () => [] },
        },
      },
    },
  };
};

describe("mobile view", () => {
  it("switches only when it is not on yet, without rulers, at the screen's width", () => {
    const { api, calls } = fakeApi();
    const view = createMobileViewCommands(api);
    view.set(true);
    view.set(true);
    expect(calls).toEqual(["mobile view", "no rulers", "fit width", "no rulers", "fit width"]);
    view.set(false);
    expect(calls.slice(-3)).toEqual(["pages", "rulers", "fit width"]);
  });

  it("draws the PDF from the pages and comes back to the mobile view", () => {
    const { api, calls } = fakeApi(true);
    const drawn = onPages(api, () => {
      calls.push("draw");
      return "commands";
    });
    expect(drawn).toBe("commands");
    expect(calls).toEqual(["pages", "lay out", "draw", "mobile view"]);
  });

  it("draws at once where the pages show", () => {
    const { api, calls } = fakeApi(false);
    onPages(api, () => calls.push("draw"));
    expect(calls).toEqual(["draw"]);
  });
});
