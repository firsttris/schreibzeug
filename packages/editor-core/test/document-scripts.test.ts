import { describe, expect, it } from "vitest";
import {
  beforeOpening,
  type PdfScriptAction,
  silencePdfScripts,
  withoutCustomFunctions,
} from "../src/document-scripts";

/** Stands in for pdf/src/forms/formActions.js CActionRunScript: records the script it would eval. */
const fakePdfWindow = () => {
  const evaluated: string[] = [];
  function CActionRunScript(this: PdfScriptAction, script: string) {
    this.script = script;
  }
  CActionRunScript.prototype.Do = function (this: PdfScriptAction) {
    evaluated.push(this.script);
  };
  CActionRunScript.prototype.RunScript = function (this: PdfScriptAction, event: unknown) {
    evaluated.push(this.script);
    return event;
  };
  const create = (script: string) =>
    new (CActionRunScript as unknown as new (script: string) => PdfScriptAction)(script);
  const win = { AscPDF: { CActionRunScript: CActionRunScript as unknown as { prototype: PdfScriptAction } } };
  return { win, create, evaluated };
};

describe("document scripts", () => {
  it("runs a PDF's JavaScript actions as empty scripts and keeps them for saving", () => {
    const { win, create, evaluated } = fakePdfWindow();
    silencePdfScripts(win);
    const action = create("top.location = 'https://example.org'");
    action.Do();
    expect(action.RunScript({ name: "Format" })).toEqual({ name: "Format" });
    expect(evaluated).toEqual(["", ""]);
    expect(action.script).toBe("top.location = 'https://example.org'");
  });

  it("silences a frame's PDF actions once and leaves a frame without the PDF code alone", () => {
    const { win } = fakePdfWindow();
    silencePdfScripts(win);
    const silenced = win.AscPDF.CActionRunScript.prototype.Do;
    silencePdfScripts(win);
    expect(win.AscPDF.CActionRunScript.prototype.Do).toBe(silenced);
    expect(() => silencePdfScripts({})).not.toThrow();
  });

  it("prepares right before the engine opens the document, with the engine's own openDocument", () => {
    const steps: unknown[] = [];
    const proto = {
      openDocument(file: unknown) {
        steps.push(["open", file]);
        return "opened";
      },
    };
    const api = beforeOpening(Object.create(proto) as typeof proto, () => steps.push("prepare"));
    expect(api.openDocument("binary")).toBe("opened");
    expect(steps).toEqual(["prepare", ["open", "binary"]]);
  });

  it("never evaluates a spreadsheet's custom functions", () => {
    const evaluated: unknown[] = [];
    const proto = { registerCustomFunctionsLibrary: (library: unknown) => evaluated.push(library) };
    const api = withoutCustomFunctions(Object.create(proto) as typeof proto);
    api.registerCustomFunctionsLibrary({ macrosArray: [{ value: "fetch('/api/tokens')" }] });
    expect(evaluated).toEqual([]);
  });
});
