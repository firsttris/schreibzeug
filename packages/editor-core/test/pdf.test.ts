import { describe, expect, it } from "vitest";
import type { OpenOptions } from "../src/document";
import {
  createPageCommands,
  createPdfCommands,
  preloadTypingFonts,
  rgbOf,
  savePdf,
  TYPED_CHARACTERS,
} from "../src/pdf";
import { initialPdfState, type PdfEvent, type PdfState, reducePdfState } from "../src/pdf-state";
import type { PdfEngineApi, PdfWindow } from "../src/pdf-types";
import { FakeColor } from "./fake-engine";

/** Records every call; answers come from `answers` by method name. */
const fakeApi = (answers: Record<string, unknown> = {}) => {
  const calls: unknown[][] = [];
  const api = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args]);
          const answer = answers[name];
          return typeof answer === "function" ? answer(...args) : answer;
        },
    },
  ) as PdfEngineApi;
  return { api, calls };
};

/** The constants the commands read from the frame (pdf/src/defines.js, common/commonDefines.js). */
const fakeWindow = (pens: unknown[][] = []) =>
  ({
    Asc: {
      asc_CColor: FakeColor,
      asc_CStroke: function FakeStroke() {
        const pen: unknown[] = [];
        pens.push(pen);
        return new Proxy(
          {},
          {
            get:
              (_, name: string) =>
              (...args: unknown[]) =>
                pen.push([name, ...args]),
          },
        );
      },
      c_oAscStrokeType: { STROKE_COLOR: 1 },
      c_oDashType: { solid: 6 },
      c_oAscPdfContextMenuTypes: { Thumbnails: 1 },
    },
    AscDFH: { historydescription_Pdf_AddPage: 77 },
    AscPDF: {
      ANNOTATIONS_TYPES: { Highlight: 8, Underline: 9, Strikeout: 11, Square: 4, Circle: 5, Line: 3 },
      FREE_TEXT_INTENT_TYPE: { freeText: 0 },
    },
  }) as unknown as PdfWindow;

const commandsWith = (api: PdfEngineApi, win = fakeWindow()) => {
  let state: PdfState = initialPdfState;
  const events: PdfEvent[] = [];
  const commands = createPdfCommands(
    win,
    api,
    () => state,
    (event) => {
      events.push(event);
      state = reducePdfState(state, event);
    },
  );
  return { commands, events, state: () => state };
};

describe("rgbOf", () => {
  it("reads #rrggbb and takes anything else as black", () => {
    expect(rgbOf("#ffd400")).toEqual([255, 212, 0]);
    expect(rgbOf("gelb")).toEqual([0, 0, 0]);
  });
});

describe("pdf tools", () => {
  it("starts a marker with its annotation type and colour, as web-apps' Toolbar.js does", () => {
    const { api, calls } = fakeApi();
    const { commands, state } = commandsWith(api);
    commands.setTool("highlight");
    expect(calls).toEqual([
      ["asc_setViewerTargetType", "select"],
      ["SetMarkerFormat", 8, true, 100, 255, 212, 0],
    ]);
    expect(state().tool).toBe("highlight");
  });

  it("ends the tool before it starts the next one", () => {
    const { api, calls } = fakeApi();
    const { commands } = commandsWith(api);
    commands.setTool("strikeout", "#000000");
    commands.setTool("redact");
    commands.setTool("hand");
    expect(calls).toEqual([
      ["asc_setViewerTargetType", "select"],
      ["SetMarkerFormat", 11, true, 100, 0, 0, 0],
      ["SetMarkerFormat", undefined, false],
      ["asc_setViewerTargetType", "select"],
      ["SetRedactTool", true],
      ["SetRedactTool", false],
      ["asc_setViewerTargetType", "hand"],
    ]);
  });

  it("draws freehand and shapes with a solid pen of the tool's colour", () => {
    const pens: unknown[][] = [];
    const { api, calls } = fakeApi();
    const { commands } = commandsWith(api, fakeWindow(pens));
    commands.setTool("draw");
    commands.setTool("square", "#00ff00");
    commands.setTool("select");
    expect(calls.map(([name, ...args]) => [name, args[0]])).toEqual([
      ["asc_setViewerTargetType", "select"],
      ["asc_StartDrawInk", expect.anything()],
      ["asc_StopInkDrawer", undefined],
      ["asc_setViewerTargetType", "select"],
      ["StartAddAnnot", 4],
      ["StartAddAnnot", ""],
      ["asc_setViewerTargetType", "select"],
    ]);
    expect(pens[1]).toEqual([
      ["put_type", 1],
      ["put_color", expect.objectContaining({})],
      ["asc_putPrstDash", 6],
      ["put_width", 0.75],
      ["put_transparent", 255],
    ]);
  });

  it("adds a text box and blacks out what was marked", () => {
    const { api, calls } = fakeApi({ HasRedact: true });
    const { commands } = commandsWith(api);
    commands.addTextBox();
    commands.applyRedactions();
    expect(commands.hasRedactions()).toBe(true);
    commands.undo();
    commands.redo();
    expect(calls).toEqual([["AddFreeTextAnnot", 0], ["ApplyRedact"], ["HasRedact"], ["Undo"], ["Redo"]]);
  });
});

describe("pdf state", () => {
  it("falls back to selecting when the engine ends the tool in use", () => {
    let state = reducePdfState(initialPdfState, { type: "tool", value: "underline" });
    state = reducePdfState(state, { type: "toolEnded", tools: ["redact"] });
    expect(state.tool).toBe("underline");
    state = reducePdfState(state, { type: "toolEnded", tools: ["highlight", "underline", "strikeout"] });
    expect(state.tool).toBe("select");
  });

  it("follows the page in view", () => {
    expect(reducePdfState(initialPdfState, { type: "currentPage", value: 3 }).currentPage).toBe(3);
  });
});

describe("page commands", () => {
  it("acts on the selected pages, or on the page in view when none is selected", () => {
    const selection: number[] = [2, 0];
    const { api, calls } = fakeApi({
      getSelectedPages: () => selection,
      getCurrentPage: 4,
      getCountPages: 5,
      asc_CanRemovePages: true,
    });
    const pages = createPageCommands(fakeWindow(), api);
    pages.rotate();
    pages.rotate("left");
    expect(pages.remove()).toBe(true);
    selection.length = 0;
    pages.rotate();
    expect(calls.filter(([name]) => name !== "getSelectedPages" && name !== "getCurrentPage")).toEqual([
      ["asc_RotatePage", 90, [0, 2]],
      ["asc_RotatePage", -90, [0, 2]],
      ["getCountPages"],
      ["asc_CanRemovePages", [0, 2]],
      ["asc_RemovePage", [0, 2]],
      ["asc_RotatePage", 90, [4]],
    ]);
  });

  it("never removes the last page, nor pages the engine keeps", () => {
    const { api, calls } = fakeApi({ getSelectedPages: [0, 1], getCountPages: 2, asc_CanRemovePages: true });
    expect(createPageCommands(fakeWindow(), api).remove()).toBe(false);
    const locked = fakeApi({ getSelectedPages: [0], getCountPages: 2, asc_CanRemovePages: false });
    expect(createPageCommands(fakeWindow(), locked.api).remove()).toBe(false);
    expect([...calls, ...locked.calls].some(([name]) => name === "asc_RemovePage")).toBe(false);
  });

  it("puts a blank page before or after the page in view", () => {
    const { api, calls } = fakeApi({ getCurrentPage: 1 });
    const pages = createPageCommands(fakeWindow(), api);
    pages.addBlank("before");
    pages.addBlank("after");
    pages.goTo(0);
    expect(calls.filter(([name]) => name !== "getCurrentPage")).toEqual([
      ["asc_AddPage", 1],
      ["asc_AddPage", 2],
      ["goToPage", 0],
    ]);
  });
});

describe("savePdf", () => {
  const original = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]);
  const options = (applied: unknown[][]) =>
    ({
      bytes: original,
      applyPdfChanges: async (bytes: Uint8Array, changes: Uint8Array, media: unknown) => {
        applied.push([bytes, changes, media]);
        return new Uint8Array([7]);
      },
    }) as unknown as OpenOptions;

  it("writes the editor's changes into the file it opened", async () => {
    const changes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9]);
    const { api } = fakeApi({ getDocumentRenderer: { Save: () => changes } });
    const applied: unknown[][] = [];
    const media = { "image1.png": new Uint8Array([1]) };
    await expect(savePdf(api, options(applied), async () => media)).resolves.toEqual(new Uint8Array([7]));
    expect(applied).toEqual([[original, changes, media]]);
  });

  it("keeps the file as it is without changes", async () => {
    const { api } = fakeApi({ getDocumentRenderer: { Save: () => null } });
    const applied: unknown[][] = [];
    await expect(savePdf(api, options(applied), async () => ({}))).resolves.toBe(original);
    expect(applied).toEqual([]);
  });
});

describe("preloadTypingFonts", () => {
  it("lets the font picker collect the fonts for German text and loads them", () => {
    const picked: string[] = [];
    const { api, calls } = fakeApi({
      getPDFDoc: { checkFonts: (names: string[]) => calls.push(["checkFonts", names]) },
    });
    const win = {
      AscFonts: { FontPickerByCharacter: { getFontsByString: (text: string) => picked.push(text) } },
    };
    preloadTypingFonts(win as unknown as PdfWindow, api);
    expect(picked).toEqual([TYPED_CHARACTERS]);
    expect(TYPED_CHARACTERS).toContain("ÄÖÜäöüß€");
    expect(calls).toContainEqual(["checkFonts", []]);
  });
});

describe("pages between files", () => {
  it("puts another PDF's pages after the page in view or at the end, as one step", () => {
    const actions: unknown[][] = [];
    const doc = {
      DoAction: (action: () => void, description: number) => {
        actions.push(["DoAction", description]);
        action();
      },
      MergePagesBinary: (position: number, pdf: Uint8Array) =>
        actions.push(["MergePagesBinary", position, pdf]),
    };
    const { api } = fakeApi({ getPDFDoc: doc, getCurrentPage: 1, getCountPages: 4 });
    const pages = createPageCommands(fakeWindow(), api);
    const other = new Uint8Array([0x25, 0x50]);
    pages.append(other, "after");
    pages.append(other, "end");
    expect(actions).toEqual([
      ["DoAction", 77],
      ["MergePagesBinary", 2, other],
      ["DoAction", 77],
      ["MergePagesBinary", 4, other],
    ]);
  });

  it("makes a PDF of the selected pages", () => {
    const extracted = new Uint8Array([9]);
    const asked: unknown[] = [];
    const doc = {
      GetPagesBinary: (indexes: number[], base64: boolean) => {
        asked.push([indexes, base64]);
        return extracted;
      },
    };
    const { api } = fakeApi({ getPDFDoc: doc, getSelectedPages: [3, 1] });
    expect(createPageCommands(fakeWindow(), api).extract()).toBe(extracted);
    expect(asked).toEqual([[[1, 3], false]]);
  });

  it("draws a page at the resolution asked, unrotated and on white", () => {
    const canvas = {} as HTMLCanvasElement;
    const asked: unknown[] = [];
    const file = {
      // 72 dpi: the page's size in points, A4.
      pages: [{ W: 595, H: 842, Dpi: 72 }],
      getPage: (...args: unknown[]) => {
        asked.push(args);
        return canvas;
      },
    };
    const { api } = fakeApi({ getPDFDoc: { Viewer: { file } } });
    const pages = createPageCommands(fakeWindow(), api);
    expect(pages.render(0, 144)).toBe(canvas);
    expect(asked).toEqual([[0, 1190, 1684, true, 0xffffff]]);
    expect(pages.render(1, 144)).toBeNull();
  });
});
