import { describe, expect, it } from "vitest";
import { moveRegion } from "./regions";

const page = () => {
  document.body.innerHTML = `
    <div role="menubar"><button>Datei</button><button>Hilfe</button></div>
    <div role="toolbar"><button tabindex="-1">Fett</button><button tabindex="0">Kursiv</button></div>
    <iframe></iframe>`;
  let inDocument = 0;
  const focusDocument = () => {
    inDocument += 1;
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const shownAll = () => true;
  return { focusDocument, shownAll, inDocument: () => inDocument };
};

describe("moveRegion", () => {
  it("goes from the document to the menus, the toolbar's current button and back", () => {
    const { focusDocument, shownAll, inDocument } = page();
    moveRegion(document, 1, focusDocument, shownAll);
    expect(document.activeElement?.textContent).toBe("Datei");
    moveRegion(document, 1, focusDocument, shownAll);
    expect(document.activeElement?.textContent).toBe("Kursiv");
    moveRegion(document, 1, focusDocument, shownAll);
    expect(inDocument()).toBe(1);
  });

  it("goes backwards with Umschalt+F6", () => {
    const { focusDocument, shownAll } = page();
    moveRegion(document, -1, focusDocument, shownAll);
    expect(document.activeElement?.textContent).toBe("Kursiv");
    moveRegion(document, -1, focusDocument, shownAll);
    expect(document.activeElement?.textContent).toBe("Datei");
  });

  it("passes over parts that are not shown", () => {
    const { focusDocument, inDocument } = page();
    const menusHidden = (element: HTMLElement) => element.getAttribute("role") !== "menubar";
    moveRegion(document, 1, focusDocument, menusHidden);
    expect(document.activeElement?.textContent).toBe("Kursiv");
    moveRegion(document, 1, focusDocument, () => false);
    expect(inDocument()).toBe(1);
  });
});
