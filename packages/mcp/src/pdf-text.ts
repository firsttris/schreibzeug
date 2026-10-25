import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

/** A PDF's text page by page, and its form fields with their values. */
export type PdfText = {
  pageCount: number;
  pages: { number: number; text: string }[];
  fields: { name: string; value: string }[];
};

type TextItem = { str?: string; hasEOL?: boolean };
type Annotation = { fieldName?: string; fieldValue?: unknown };

/** A form field's value as text: a text, a choice, a check box's export value. */
const fieldText = (value: unknown): string =>
  value === undefined || value === null || value === "Off"
    ? ""
    : Array.isArray(value)
      ? value.join(", ")
      : String(value);

/**
 * Reads the text of the given pages with pdf.js (the legacy build runs on Bun and Node; its worker
 * starts in the same process). Scans without a text layer read as empty: "PDF → Texterkennung"
 * in the app gives them one. Fonts are not needed for text, so no font data is loaded.
 */
export const pdfText = async (bytes: Uint8Array, wanted: (page: number) => boolean): Promise<PdfText> => {
  const loading = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  const document = await loading.promise;
  try {
    const pages: PdfText["pages"] = [];
    const fields = new Map<string, string>();
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      // Form fields are widgets on the pages (getFieldObjects needs the scripting build).
      for (const annotation of (await page.getAnnotations()) as Annotation[]) {
        if (annotation.fieldName && !fields.has(annotation.fieldName))
          fields.set(annotation.fieldName, fieldText(annotation.fieldValue));
      }
      if (!wanted(number)) continue;
      const content = await page.getTextContent();
      const text = (content.items as TextItem[])
        .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : ""}`)
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      pages.push({ number, text });
    }
    return {
      pageCount: document.numPages,
      pages,
      fields: [...fields].map(([name, value]) => ({ name, value })),
    };
  } finally {
    await loading.destroy();
  }
};

/** "2", "1-3", "1,4-5" → which pages; empty: all. */
export const pagesWanted = (spec: string | undefined): ((page: number) => boolean) | null => {
  if (!spec?.trim()) return () => true;
  const ranges = spec.split(",").map((part) => /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part));
  if (ranges.some((range) => range === null)) return null;
  const bounds = ranges.map((range) => [Number(range?.[1]), Number(range?.[2] ?? range?.[1])] as const);
  return (page) => bounds.some(([from, to]) => page >= from && page <= to);
};
