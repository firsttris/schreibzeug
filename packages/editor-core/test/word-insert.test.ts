import { describe, expect, it } from "vitest";
import { createInsertCommands, type EngineTableOfContentsPr, type InsertApi } from "../src/word-insert";

const Asc = {
  c_oAscSectionBreakType: { NextPage: 0, Continuous: 3 },
  c_oAscTabLeader: { Dot: 0 },
};

/** Table-of-contents properties that record what is put. */
const recordingPr = () => {
  const put: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      put.push([name, ...args]);
    };
  const props: EngineTableOfContentsPr = {
    put_OutlineRange: record("outline"),
    put_Hyperlink: record("hyperlink"),
    put_ShowPageNumbers: record("pageNumbers"),
    put_RightAlignTab: record("rightTab"),
    put_TabLeader: record("leader"),
  };
  return { put, props };
};

const fakeApi = (existing: EngineTableOfContentsPr | null) => {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const api: InsertApi = {
    asc_GetTableOfContentsPr: () => existing,
    asc_AddTableOfContents: record("addToc"),
    asc_UpdateTableOfContents: record("updateToc"),
    asc_AddFootnote: record("footnote"),
    asc_AddEndnote: record("endnote"),
    put_AddColumnBreak: record("columnBreak"),
    add_SectionBreak: record("sectionBreak"),
    AddShapeOnCurrentPage: record("shape"),
  };
  return { api, calls };
};

describe("the table of contents", () => {
  it("lists every heading level with dotted leaders and linked page numbers", () => {
    const { put, props } = recordingPr();
    const { api, calls } = fakeApi(null);
    createInsertCommands(
      api,
      Asc,
      () => props,
      () => {},
    ).tableOfContents();
    expect(put).toEqual([
      ["outline", 1, 9],
      ["hyperlink", true],
      ["pageNumbers", true],
      ["rightTab", true],
      ["leader", 0],
    ]);
    expect(calls).toEqual([["addToc", null, props]]);
  });

  it("changes the one there is instead of adding a second", () => {
    const existing = recordingPr();
    const { api, calls } = fakeApi(existing.props);
    createInsertCommands(
      api,
      Asc,
      () => recordingPr().props,
      () => {},
    ).tableOfContents();
    expect(calls).toEqual([["addToc", null, existing.props]]);
  });

  it("is rebuilt only where there is one", () => {
    const none = fakeApi(null);
    expect(
      createInsertCommands(
        none.api,
        Asc,
        () => recordingPr().props,
        () => {},
      ).updateTableOfContents(),
    ).toBe(false);
    expect(none.calls).toEqual([]);

    const one = fakeApi(recordingPr().props);
    expect(
      createInsertCommands(
        one.api,
        Asc,
        () => recordingPr().props,
        () => {},
      ).updateTableOfContents(),
    ).toBe(true);
    expect(one.calls).toEqual([["updateToc", false]]);
  });
});

describe("the keys", () => {
  it("go back to the document after each command", () => {
    const { api } = fakeApi(null);
    let focused = 0;
    const commands = createInsertCommands(
      api,
      Asc,
      () => recordingPr().props,
      () => {
        focused += 1;
      },
    );
    commands.footnote();
    commands.textBox();
    expect(focused).toBe(2);
  });
});

describe("notes, breaks and text boxes", () => {
  it("go in at the cursor or on the page shown", () => {
    const { api, calls } = fakeApi(null);
    const commands = createInsertCommands(
      api,
      Asc,
      () => recordingPr().props,
      () => {},
    );
    commands.footnote();
    commands.endnote();
    commands.columnBreak();
    commands.sectionBreak("nextPage");
    commands.sectionBreak("continuous");
    commands.textBox();
    expect(calls).toEqual([
      ["footnote"],
      ["endnote"],
      ["columnBreak"],
      ["sectionBreak", 0],
      ["sectionBreak", 3],
      ["shape", "textRect"],
    ]);
  });
});
