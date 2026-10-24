/** A colour as "#rrggbb". */
export type PdfColor = string;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** "#ffd400" → [255, 212, 0]; anything else is black. */
export const rgbOf = (color: PdfColor): [number, number, number] => {
  const match = HEX.exec(color);
  if (!match) return [0, 0, 0];
  return [
    Number.parseInt(match[1] ?? "0", 16),
    Number.parseInt(match[2] ?? "0", 16),
    Number.parseInt(match[3] ?? "0", 16),
  ];
};
