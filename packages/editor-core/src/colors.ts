import type { EngineColor, EngineColorConstructor } from "./engine-types";

/** A text colour as the UI sees it: "#rrggbb", or null for "automatic" (black on white). */
export type TextColor = string | null;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

const byte = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

/** common/apiCommon.js asc_CColor: the colour of the selection, as asc_onTextColor sends it. */
export const toTextColor = (color: EngineColor): TextColor =>
  color.asc_getAuto() ? null : `#${byte(color.asc_getR())}${byte(color.asc_getG())}${byte(color.asc_getB())}`;

/**
 * Builds the colour put_TextColor takes (word/api.js): an sRGB asc_CColor, or one marked Auto,
 * which the engine writes as `w:color w:val="auto"`.
 */
export const createEngineColor =
  (AscColor: EngineColorConstructor) =>
  (color: TextColor): EngineColor => {
    const match = color === null ? null : HEX.exec(color);
    if (!match) {
      const automatic = new AscColor();
      automatic.asc_putAuto(true);
      return automatic;
    }
    const [, r = "0", g = "0", b = "0"] = match;
    return new AscColor(Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16));
  };
