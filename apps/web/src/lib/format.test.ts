import { describe, expect, it } from "vitest";
import {
  editorOf,
  extensionOf,
  formatChanged,
  formatSize,
  isEditable,
  isLegacyFile,
  isOfficeFile,
  kindOf,
} from "./format";

describe("formatSize", () => {
  it.each([
    [null, "–"],
    [0, "0 Byte"],
    [1023, "1.023 Byte"],
    [1536, "1,5 KB"],
    [5 * 1024 * 1024, "5 MB"],
    [3.25 * 1024 ** 3, "3,3 GB"],
  ])("formats %s as %s", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});

describe("formatChanged", () => {
  const now = new Date(2026, 9, 23, 16, 30);
  const at = (...parts: [number, number, number, number?, number?]) => new Date(...parts).toISOString();

  it("shows the time for today and yesterday", () => {
    expect(formatChanged(at(2026, 9, 23, 11, 20), now)).toBe("Heute, 11:20");
    expect(formatChanged(at(2026, 9, 22, 9, 5), now)).toBe("Gestern, 09:05");
  });

  it("shows the day for older dates, with the year when it is another", () => {
    expect(formatChanged(at(2026, 9, 20, 8, 0), now)).toBe("20. Okt.");
    expect(formatChanged(at(2025, 2, 3, 8, 0), now)).toBe("3. März 2025");
  });
});

describe("kinds", () => {
  it("reads the kind from the extension", () => {
    expect(extensionOf("Bericht.Final.DOCX")).toBe("docx");
    expect(extensionOf(".hidden")).toBe("");
    expect(kindOf({ kind: "file", name: "a.xlsx" })).toBe("xlsx");
    expect(kindOf({ kind: "file", name: "a.zip" })).toBe("other");
    expect(kindOf({ kind: "folder", name: "a.docx" })).toBe("folder");
  });

  it("opens Office files and PDFs in an editor", () => {
    expect(isEditable({ kind: "file", name: "a.docx" })).toBe(true);
    expect(isEditable({ kind: "file", name: "a.xlsx" })).toBe(true);
    expect(isEditable({ kind: "file", name: "a.pptx" })).toBe(true);
    expect(isEditable({ kind: "file", name: "a.pdf" })).toBe(true);
    expect(isEditable({ kind: "file", name: "a.zip" })).toBe(false);
    expect(isEditable({ kind: "folder", name: "a.docx" })).toBe(false);
  });

  it("tells Office files from PDFs, which make no template", () => {
    expect(isOfficeFile({ kind: "file", name: "a.csv" })).toBe(true);
    expect(isOfficeFile({ kind: "file", name: "a.pdf" })).toBe(false);
  });

  it("edits OpenDocument files in the editor of their kind, as what they are", () => {
    expect(editorOf(kindOf({ kind: "file", name: "Brief.ODT" }))).toBe("word");
    expect(editorOf(kindOf({ kind: "file", name: "a.ods" }))).toBe("sheet");
    expect(editorOf(kindOf({ kind: "file", name: "a.odp" }))).toBe("slide");
    expect(isOfficeFile({ kind: "file", name: "a.odt" })).toBe(true);
  });

  it("opens older formats by a copy in the Office format, not in an editor of their own", () => {
    for (const name of ["a.doc", "a.rtf", "a.xls", "a.ppt"]) {
      expect(isLegacyFile({ kind: "file", name })).toBe(true);
      expect(isEditable({ kind: "file", name })).toBe(true);
      expect(isOfficeFile({ kind: "file", name })).toBe(false);
      expect(editorOf(kindOf({ kind: "file", name }))).toBeNull();
    }
    expect(isLegacyFile({ kind: "file", name: "a.docx" })).toBe(false);
  });
});
