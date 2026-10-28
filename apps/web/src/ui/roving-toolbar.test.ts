import { describe, expect, it } from "vitest";
import { attachRovingToolbar, toolbarItems } from "./roving-toolbar";

const toolbar = () => {
  document.body.innerHTML = `
    <div role="toolbar">
      <select aria-label="Schriftart"><option>Arial</option></select>
      <button>Fett</button><button disabled>Kursiv</button><button>Unterstrichen</button>
      <div><button>Farbe</button><fieldset data-panel><button>Rot</button></fieldset></div>
    </div>`;
  return document.querySelector<HTMLElement>('[role="toolbar"]')!;
};
const names = (buttons: HTMLElement[]) => buttons.map((button) => button.textContent);
const press = (key: string) =>
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

describe("roving toolbar", () => {
  it("takes the enabled buttons, not a panel's or the fields", () => {
    expect(names(toolbarItems(toolbar()))).toEqual(["Fett", "Unterstrichen", "Farbe"]);
  });

  it("leaves one button in the Tab order and goes along with the arrow keys", () => {
    const bar = toolbar();
    attachRovingToolbar(bar);
    const stops = () => names(toolbarItems(bar).filter((button) => button.tabIndex === 0));
    expect(stops()).toEqual(["Fett"]);
    toolbarItems(bar)[0]?.focus();
    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Unterstrichen");
    expect(stops()).toEqual(["Unterstrichen"]);
    press("End");
    expect(document.activeElement?.textContent).toBe("Farbe");
    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Fett");
    expect(bar.querySelector("select")?.tabIndex).toBe(0);
  });
});
