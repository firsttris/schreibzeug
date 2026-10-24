import type { InsertCommands } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { insertGroups, NO_TABLE_OF_CONTENTS } from "./insert-menus";

const recording = (hasTableOfContents: boolean) => {
  const calls: unknown[][] = [];
  const insert: InsertCommands = {
    tableOfContents: () => calls.push(["toc"]),
    updateTableOfContents: () => {
      calls.push(["update"]);
      return hasTableOfContents;
    },
    footnote: () => calls.push(["footnote"]),
    endnote: () => calls.push(["endnote"]),
    columnBreak: () => calls.push(["columnBreak"]),
    sectionBreak: (type) => calls.push(["sectionBreak", type]),
    textBox: () => calls.push(["textBox"]),
  };
  return { calls, insert };
};

const select = (groups: ReturnType<typeof insertGroups>, label: string) =>
  groups
    .flat()
    .find((item) => item.label === label)
    ?.onSelect();

describe("breaks, contents and notes in Einfügen", () => {
  it("run their commands", () => {
    const { calls, insert } = recording(true);
    const groups = insertGroups(
      insert,
      () => calls.push(["pageBreak"]),
      false,
      () => {},
    );
    for (const label of [
      "Seitenumbruch",
      "Spaltenumbruch",
      "Abschnittsumbruch (nächste Seite)",
      "Abschnittsumbruch (fortlaufend)",
      "Inhaltsverzeichnis",
      "Inhaltsverzeichnis aktualisieren",
      "Fußnote",
      "Endnote",
    ])
      select(groups, label);
    expect(calls).toEqual([
      ["pageBreak"],
      ["columnBreak"],
      ["sectionBreak", "nextPage"],
      ["sectionBreak", "continuous"],
      ["toc"],
      ["update"],
      ["footnote"],
      ["endnote"],
    ]);
  });

  it("say so when there is no table of contents to update", () => {
    const notices: string[] = [];
    const groups = insertGroups(
      recording(false).insert,
      () => {},
      false,
      (message) => notices.push(message),
    );
    select(groups, "Inhaltsverzeichnis aktualisieren");
    expect(notices).toEqual([NO_TABLE_OF_CONTENTS]);
  });

  it("are off while the document opens", () => {
    const groups = insertGroups(
      null,
      () => {},
      true,
      () => {},
    );
    expect(groups.flat().every((item) => item.disabled)).toBe(true);
  });
});
