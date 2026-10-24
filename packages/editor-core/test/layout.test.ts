import { describe, expect, it } from "vitest";
import {
  createLayoutCommands,
  type LayoutApi,
  marginPresetOf,
  type PageLayout,
  paperSizeOf,
  readLineSpacing,
  readSection,
  type SectionProps,
} from "../src/layout";

const constants = { portrait: 0, lineRuleAuto: 1 };

const page = (width: number, height: number): PageLayout => ({
  width,
  height,
  portrait: width < height,
  margins: { top: 20, left: 30, bottom: 20, right: 15 },
});

/** A CDocumentSectionProps: plain fields behind its getters and setters. */
const sectionProps = (
  fields: Record<string, number | undefined> = {},
): SectionProps & { fields: typeof fields } => ({
  fields,
  get_W: () => fields.W as number,
  get_H: () => fields.H as number,
  get_Orientation: () => fields.Orient as number,
  get_TopMargin: () => fields.Top as number,
  get_LeftMargin: () => fields.Left as number,
  get_BottomMargin: () => fields.Bottom as number,
  get_RightMargin: () => fields.Right as number,
  put_TopMargin: (value) => {
    fields.Top = value;
  },
  put_LeftMargin: (value) => {
    fields.Left = value;
  },
  put_BottomMargin: (value) => {
    fields.Bottom = value;
  },
  put_RightMargin: (value) => {
    fields.Right = value;
  },
});

describe("page layout", () => {
  it("reads the section the cursor is in", () => {
    const props = sectionProps({ W: 297, H: 210, Orient: 1, Top: 20, Left: 30, Bottom: 20, Right: 15 });
    expect(readSection(props, constants)).toEqual({
      width: 297,
      height: 210,
      portrait: false,
      margins: { top: 20, left: 30, bottom: 20, right: 15 },
    });
  });

  it("recognises the paper size whichever way the page lies", () => {
    expect(paperSizeOf(page(210, 297))?.id).toBe("A4");
    expect(paperSizeOf(page(297, 210.04))?.id).toBe("A4");
    expect(paperSizeOf(page(215.9, 279.4))?.id).toBe("Letter");
    expect(paperSizeOf(page(200, 300))).toBeNull();
  });

  it("recognises the margin presets", () => {
    expect(marginPresetOf({ top: 20, left: 30, bottom: 20, right: 15 })).toBe("normal");
    expect(marginPresetOf({ top: 12.7, left: 12.7, bottom: 12.7, right: 12.7 })).toBe("narrow");
    expect(marginPresetOf({ top: 25, left: 25, bottom: 25, right: 25 })).toBeNull();
  });

  it("reads line spacing only as a multiple of a line", () => {
    const spacing = (line: number, rule: number) => ({
      asc_getLine: () => line,
      asc_getLineRule: () => rule,
    });
    expect(readLineSpacing(spacing(1.149999, 1), constants)).toBe(1.15);
    expect(readLineSpacing(spacing(12, 0), constants)).toBeNull();
    expect(readLineSpacing(spacing(Number.NaN, 1), constants)).toBeNull();
  });

  it("sets margins through section props that leave the rest alone", () => {
    const calls: unknown[][] = [];
    const api: LayoutApi = {
      change_PageOrient: (portrait) => calls.push(["change_PageOrient", portrait]),
      change_DocSize: (width, height) => calls.push(["change_DocSize", width, height]),
      asc_SetSectionProps: (props) =>
        calls.push(["asc_SetSectionProps", (props as never as { fields: unknown }).fields]),
      put_PrLineSpacing: (rule, value) => calls.push(["put_PrLineSpacing", rule, value]),
      IncreaseIndent: () => calls.push(["IncreaseIndent"]),
      DecreaseIndent: () => calls.push(["DecreaseIndent"]),
    };
    const commands = createLayoutCommands(api, () => sectionProps(), constants);
    commands.setMargins({ top: 10, left: 11, bottom: 12, right: 13 });
    commands.setOrientation(false);
    commands.setPaperSize({ id: "A5", width: 148, height: 210 });
    commands.setLineSpacing(1.5);
    commands.indent("more");
    commands.indent("less");
    expect(calls).toEqual([
      ["asc_SetSectionProps", { Top: 10, Left: 11, Bottom: 12, Right: 13 }],
      ["change_PageOrient", false],
      ["change_DocSize", 148, 210],
      ["put_PrLineSpacing", 1, 1.5],
      ["IncreaseIndent"],
      ["DecreaseIndent"],
    ]);
  });
});
