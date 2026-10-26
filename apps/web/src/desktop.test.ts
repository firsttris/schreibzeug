import { afterEach, describe, expect, it } from "vitest";
import { desktopCommandUrl, inDesktopApp } from "./desktop";

const marked = window as { schreibzeugDesktop?: unknown };

describe("the desktop app's commands", () => {
  afterEach(() => {
    delete marked.schreibzeugDesktop;
  });

  it("are only offered in the desktop app's window", () => {
    expect(inDesktopApp()).toBe(false);
    marked.schreibzeugDesktop = true;
    expect(inDesktopApp()).toBe(true);
  });

  it("go to the address the app catches (lib.rs desktop_action)", () => {
    expect(desktopCommandUrl("choose-folder")).toBe("https://desktop.schreibzeug.invalid/choose-folder");
  });
});
