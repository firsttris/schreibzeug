import type { HeaderFooterCommands } from "@stapel/editor-core";
import { describe, expect, it } from "vitest";
import { headerFooterGroups } from "./header-footer-menus";

const recording = () => {
  const calls: unknown[][] = [];
  const commands: HeaderFooterCommands = {
    edit: (part) => calls.push(["edit", part]),
    remove: (part) => calls.push(["remove", part]),
    close: () => calls.push(["close"]),
    insertPageNumber: (place) => calls.push(["pageNumber", place]),
    insertPageCount: () => calls.push(["pageCount"]),
  };
  return { calls, commands };
};

const labels = (groups: ReturnType<typeof headerFooterGroups>) => groups.flat().map((item) => item.label);

describe("header and footer entries", () => {
  it("offers to edit outside a header and to leave or remove it inside", () => {
    const { commands } = recording();
    expect(labels(headerFooterGroups(commands, false, false))).toContain("Kopfzeile bearbeiten");
    const inside = labels(headerFooterGroups(commands, true, false));
    expect(inside).toContain("Kopf- und Fußzeile schließen");
    expect(inside).not.toContain("Kopfzeile bearbeiten");
  });

  it("puts a page number in the footer", () => {
    const { calls, commands } = recording();
    headerFooterGroups(commands, false, false)
      .flat()
      .find((item) => item.label === "Seitenzahl unten mittig")
      ?.onSelect();
    expect(calls).toEqual([["pageNumber", { in: "footer", align: "center" }]]);
  });
});
