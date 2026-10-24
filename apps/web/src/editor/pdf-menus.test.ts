import { initialPdfState, type PdfCommands } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { pagesLabel, pdfMenus, toggleTool } from "./pdf-menus";

describe("pagesLabel", () => {
  it("counts pages from 1 and joins runs", () => {
    expect(pagesLabel([1])).toBe("Seite 2");
    expect(pagesLabel([0, 1, 2])).toBe("Seiten 1–3");
    expect(pagesLabel([3, 0, 2])).toBe("Seiten 1, 3–4");
  });
});

describe("toggleTool", () => {
  it("switches a tool on, and off again to selecting", () => {
    const picked: string[] = [];
    const commands = { setTool: (tool: string) => picked.push(tool) } as unknown as PdfCommands;
    toggleTool(commands, "select", "highlight");
    toggleTool(commands, "highlight", "highlight");
    expect(picked).toEqual(["highlight", "select"]);
  });
});

describe("pdfMenus", () => {
  it("offers pages to append and to save apart, the latter only where a file can be made", () => {
    const context = {
      state: { ...initialPdfState, status: "ready" as const },
      commands: {} as PdfCommands,
      pages: null,
      view: null,
      onClipboardRefused: () => {},
      onAddNote: () => {},
      onSign: null,
      onAppendPdf: () => {},
      onExtractPages: null,
      notify: () => {},
    };
    const pages = pdfMenus(context).find((menu) => menu.label === "Seiten");
    const items = pages?.groups.flat() ?? [];
    expect(items.find((item) => item.label === "PDF anhängen …")?.disabled).toBe(false);
    expect(items.find((item) => item.label === "Als neues PDF speichern")?.disabled).toBe(true);
    const comment = pdfMenus(context).find((menu) => menu.label === "Kommentieren");
    expect(comment?.groups.flat().find((item) => item.label === "Unterschreiben …")?.disabled).toBe(true);
  });
});
