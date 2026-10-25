import { type LegacyFormat, OFFICE_FORMAT_OF_LEGACY, type OfficeFormat } from "@schreibzeug/editor-core";

/** What an older format is called, and what Schreibzeug makes of it. */
export const LEGACY_NAMES: Record<LegacyFormat, string> = {
  doc: "Word 97–2003",
  rtf: "RTF",
  xls: "Excel 97–2003",
  ppt: "PowerPoint 97–2003",
};

export type LegacyPlan = { from: LegacyFormat; to: OfficeFormat; label: string };

/** The conversion for a file in an older format, by its name; null for any other file. */
export const legacyPlanOf = (name: string): LegacyPlan | null => {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (!(extension in OFFICE_FORMAT_OF_LEGACY)) return null;
  const from = extension as LegacyFormat;
  return { from, to: OFFICE_FORMAT_OF_LEGACY[from], label: LEGACY_NAMES[from] };
};

/**
 * The copy's name: "Angebot.doc" → "Angebot.docx", or "Angebot (2).docx" and on when the folder has
 * that name already (a name is unique in a folder).
 */
export const copyNameFor = (name: string, to: OfficeFormat, taken: ReadonlySet<string>): string => {
  const base = name.replace(/\.[^.]*$/, "");
  const lower = new Set([...taken].map((existing) => existing.toLowerCase()));
  for (let number = 1; ; number++) {
    const candidate = number === 1 ? `${base}.${to}` : `${base} (${number}).${to}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
};
