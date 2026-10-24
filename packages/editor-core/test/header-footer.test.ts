import { describe, expect, it } from "vitest";
import { createHeaderFooterCommands, type HeaderFooterApi } from "../src/header-footer";

const recording = () => {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const api: HeaderFooterApi = {
    getCurrentPage: () => 2,
    GoToHeader: record("GoToHeader"),
    GoToFooter: record("GoToFooter"),
    asc_RemoveHeader: record("asc_RemoveHeader"),
    asc_RemoveFooter: record("asc_RemoveFooter"),
    asc_CancelHdrFtrEditing: record("asc_CancelHdrFtrEditing"),
    put_PageNum: record("put_PageNum"),
    asc_AddPageCount: record("asc_AddPageCount"),
  };
  return { calls, commands: createHeaderFooterCommands(api, record("focus")) };
};

describe("headers, footers and page numbers", () => {
  it("edits and removes the header or footer of the current page", () => {
    const { calls, commands } = recording();
    commands.edit("header");
    commands.edit("footer");
    commands.remove("footer");
    commands.close();
    expect(calls).toEqual([
      ["GoToHeader", 2],
      ["focus"],
      ["GoToFooter", 2],
      ["focus"],
      ["asc_RemoveFooter", 2],
      ["asc_CancelHdrFtrEditing"],
      ["focus"],
    ]);
  });

  it("puts page numbers where web-apps puts them", () => {
    const { calls, commands } = recording();
    commands.insertPageNumber({ in: "footer", align: "center" });
    commands.insertPageNumber({ in: "header", align: "right" });
    commands.insertPageNumber();
    commands.insertPageCount();
    expect(calls).toEqual([
      ["put_PageNum", 2, 2],
      ["put_PageNum", 1, 0],
      ["put_PageNum", -1],
      ["asc_AddPageCount"],
    ]);
  });
});
