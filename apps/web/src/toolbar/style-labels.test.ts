import { describe, expect, it } from "vitest";
import { styleLabel } from "./style-labels";

describe("styleLabel", () => {
  it.each([
    ["Normal", "Standard"],
    ["Heading 1", "Überschrift 1"],
    ["heading 9", "Überschrift 9"],
    ["Title", "Titel"],
    ["List Paragraph", "Listenabsatz"],
    ["Angebotskopf", "Angebotskopf"],
  ])("shows %s as %s", (name, label) => {
    expect(styleLabel(name)).toBe(label);
  });
});
