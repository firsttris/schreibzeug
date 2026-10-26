import { nodeIdSchema, nodeNameSchema, nodeSchema } from "@schreibzeug/files-api";
import {
  appendRows as appendToSheet,
  type CellValue,
  fillPlaceholders,
  markdownDocx,
  placeholdersOf,
  pptx,
  TEMPLATES,
  xlsx,
} from "@schreibzeug/ooxml";
import { z } from "zod";
import { type Api, bytes, failure, json, mapOutcome, success, withBytes, withFile } from "../api";
import { asText, presentNode } from "../present";
import { defineTool, type ToolContext } from "../tool";
import { unpacking } from "../unpack";

const parentId = nodeIdSchema
  .nullable()
  .default(null)
  .describe("Der Ordner, in den die Datei kommt; leer für „Meine Dateien“");
const name = nodeNameSchema.describe("Der Name der neuen Datei; die Endung wird ergänzt");

/** Adds the extension the format needs, unless the name already has it. */
const withExtension = (fileName: string, extension: string) =>
  fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`;

/** Stores a new file as an upload from the interface would, and answers it with its link. */
const store = async (
  { api, origin }: ToolContext,
  fileName: string,
  content: Uint8Array,
  folder: string | null,
  note?: Record<string, unknown>,
) =>
  mapOutcome(await json(api("/api/files", withFile(fileName, content, folder)), nodeSchema), (node) =>
    asText({ ...presentNode(origin, node), ...note }),
  );

export const createDocument = defineTool({
  name: "create_document",
  title: "Dokument aus Markdown",
  description:
    "Legt ein Word-Dokument (.docx) aus Markdown an: Überschriften (#), Absätze, **fett**, *kursiv*, `Code`, [Links](https://…), Aufzählungen und nummerierte Listen (eingerückt verschachtelt), Tabellen mit |, Zitate (>), Codeblöcke und Trennlinien. Die Überschriften sind Words eigene Formatvorlagen.",
  input: { name, parentId, markdown: z.string().max(500_000).describe("Der Inhalt als Markdown") },
  writes: true,
  run: (context, input) =>
    store(context, withExtension(input.name, "docx"), markdownDocx(input.markdown), input.parentId),
});

const cell = z.union([
  z.number(),
  z.string(),
  z.object({
    value: z.union([z.number(), z.string()]),
    style: z.enum(["bold", "currency", "boldCurrency", "date", "percent"]),
  }),
]);
const cellDescription =
  "Eine Zeile aus Zellen ab Spalte A: Zahl, Text oder Formel mit „=“ (englische Funktionsnamen, z. B. „=SUM(B2:B5)“); mit Format als {value, style}: bold, currency (Euro), boldCurrency, date (Wert als Excel-Datumszahl), percent (0,19 für 19 %).";

export const createSheet = defineTool({
  name: "create_sheet",
  title: "Tabelle anlegen",
  description:
    "Legt eine Excel-Tabelle (.xlsx) an, mit einem oder mehreren Blättern aus Zeilen; Formeln rechnet Schreibzeug beim Öffnen aus.",
  input: {
    name,
    parentId,
    sheets: z
      .array(
        z.object({
          name: z.string().min(1).max(31).describe("Der Name des Blatts"),
          rows: z.array(z.array(cell).describe(cellDescription)).max(10_000),
          widths: z.array(z.number().positive().max(255)).optional().describe("Spaltenbreiten in Zeichen"),
        }),
      )
      .min(1)
      .max(50),
  },
  writes: true,
  run: (context, input) =>
    store(
      context,
      withExtension(input.name, "xlsx"),
      xlsx(
        input.sheets.map((sheet) => ({
          name: sheet.name,
          rows: sheet.rows as CellValue[][],
          ...(sheet.widths ? { widths: sheet.widths } : {}),
        })),
      ),
      input.parentId,
    ),
});

export const createPresentation = defineTool({
  name: "create_presentation",
  title: "Präsentation anlegen",
  description:
    "Legt eine PowerPoint-Präsentation (.pptx, 16:9) aus Folien an: „title“ (Titel und Untertitel), „content“ (Titel und Aufzählung), „titleOnly“, „blank“.",
  input: {
    name,
    parentId,
    slides: z
      .array(
        z.object({
          layout: z.enum(["title", "content", "titleOnly", "blank"]).default("content"),
          title: z.string().optional(),
          subtitle: z.string().optional(),
          bullets: z.array(z.string()).optional(),
        }),
      )
      .min(1)
      .max(200),
  },
  writes: true,
  run: (context, input) =>
    store(
      context,
      withExtension(input.name, "pptx"),
      pptx(
        input.slides.map(({ layout, title, subtitle, bullets }) => ({
          layout,
          ...(title === undefined ? {} : { title }),
          ...(subtitle === undefined ? {} : { subtitle }),
          ...(bullets === undefined ? {} : { bullets }),
        })),
      ),
      input.parentId,
    ),
});

/** The user's own templates: the Office files of a folder "Vorlagen" at the top of their files. */
const ownTemplates = async (api: Api) => {
  const top = await json(api("/api/nodes?parent=root"), z.object({ children: nodeSchema.array() }));
  const folder = top.ok
    ? top.value.children.find((node) => node.kind === "folder" && node.name.toLowerCase() === "vorlagen")
    : undefined;
  if (!folder) return [];
  const inside = await json(
    api(`/api/nodes?parent=${folder.id}`),
    z.object({ children: nodeSchema.array() }),
  );
  return inside.ok ? inside.value.children.filter((node) => /\.(docx|xlsx|pptx)$/i.test(node.name)) : [];
};

export const listTemplates = defineTool({
  name: "list_templates",
  title: "Vorlagen",
  description:
    "Die Vorlagen für create_from_template: die eingebauten (Brief, Angebot, Rechnung, Kalkulation, Projektplan, Präsentation) und die eigenen im Ordner „Vorlagen“, jeweils mit ihren Platzhaltern in eckigen Klammern.",
  input: {},
  writes: false,
  run: async ({ api }) => {
    const builtIn = TEMPLATES.map((template) => ({
      template: template.id,
      name: template.name,
      format: template.format,
      description: template.description,
      placeholders: placeholdersOf(template.bytes()),
    }));
    const own = await Promise.all(
      (await ownTemplates(api)).map(async (node) => {
        const content = await bytes(api(`/api/files/${node.id}/content`));
        const found = content.ok
          ? unpacking(node.name, "Office-Dokument", () => placeholdersOf(content.value))
          : null;
        return { template: node.id, name: node.name, placeholders: found?.ok ? found.value : [] };
      }),
    );
    return success(asText({ builtIn, own }));
  },
});

export const createFromTemplate = defineTool({
  name: "create_from_template",
  title: "Aus Vorlage anlegen",
  description:
    "Legt eine Datei aus einer Vorlage an und füllt ihre Platzhalter: „[Nr.]“ wird zum Wert von „Nr.“ (Schlüssel ohne Klammern). Die Vorlage ist eine eingebaute (z. B. „rechnung“) oder die ID einer eigenen Datei; list_templates nennt sie mit ihren Platzhaltern. Die Antwort sagt, welche Platzhalter noch offen sind.",
  input: {
    template: z
      .string()
      .min(1)
      .describe(
        "„brief“, „angebot“, „rechnung“, „kalkulation“, „projektplan“, „praesentation“ oder die ID einer Datei",
      ),
    name,
    parentId,
    values: z.record(z.string(), z.string()).default({}).describe("Platzhalter ohne Klammern → Wert"),
  },
  writes: true,
  run: async (context, input) => {
    const builtIn = TEMPLATES.find((template) => template.id === input.template);
    const source = builtIn
      ? success({ format: builtIn.format as string, bytes: builtIn.bytes() })
      : await ownTemplate(context.api, input.template);
    if (!source.ok) return source;
    const result = unpacking(input.template, "Office-Dokument", () =>
      fillPlaceholders(source.value.bytes, input.values),
    );
    if (!result.ok) return result;
    const { bytes: filled, missing, left } = result.value;
    return store(context, withExtension(input.name, source.value.format), filled, input.parentId, {
      ...(missing.length > 0 ? { notInTemplate: missing } : {}),
      stillToFill: left,
    });
  },
});

const ownTemplate = async (api: Api, id: string) => {
  if (!nodeIdSchema.safeParse(id).success) {
    return failure<{ format: string; bytes: Uint8Array }>(
      `Eine Vorlage „${id}“ gibt es nicht. Eingebaut: ${TEMPLATES.map((template) => template.id).join(", ")}.`,
    );
  }
  const node = await json(api(`/api/nodes/${id}`), nodeSchema);
  if (!node.ok) return node;
  const format = /\.(docx|xlsx|pptx)$/i.exec(node.value.name)?.[1]?.toLowerCase();
  if (!format)
    return failure<{ format: string; bytes: Uint8Array }>(
      "Eine Vorlage ist eine .docx-, .xlsx- oder .pptx-Datei.",
    );
  return mapOutcome(await bytes(api(`/api/files/${id}/content`)), (content) => ({ format, bytes: content }));
};

export const appendRows = defineTool({
  name: "append_rows",
  title: "Zeilen anhängen",
  description:
    "Hängt Zeilen unter die letzte Zeile eines Blatts einer Excel-Tabelle an und speichert das als neue Version. Werte wie bei create_sheet, ohne Formate.",
  input: {
    id: nodeIdSchema.describe("Die ID der Tabelle"),
    sheet: z.string().optional().describe("Der Name des Blatts; leer für das erste"),
    rows: z
      .array(z.array(z.union([z.number(), z.string()])).describe("Eine Zeile ab Spalte A"))
      .min(1)
      .max(10_000),
  },
  writes: true,
  run: async ({ api, origin }, { id, sheet, rows }) => {
    const node = await json(api(`/api/nodes/${id}`), nodeSchema);
    if (!node.ok) return node;
    if (!node.value.name.toLowerCase().endsWith(".xlsx"))
      return failure("Zeilen anhängen geht nur an .xlsx-Tabellen.");
    const content = await bytes(api(`/api/files/${id}/content`));
    if (!content.ok) return content;
    const unpacked = unpacking(node.value.name, "XLSX", () => appendToSheet(content.value, rows, sheet));
    if (!unpacked.ok) return unpacked;
    const appended = unpacked.value;
    if (!appended.ok) return failure(appended.error);
    const { sheet: sheetName, firstRow, lastRow } = appended.value;
    return mapOutcome(
      await json(api(`/api/files/${id}/content`, withBytes(appended.value.bytes)), nodeSchema),
      (saved) => asText({ ...presentNode(origin, saved), sheet: sheetName, rows: `${firstRow}–${lastRow}` }),
    );
  },
});

/** Base64 of at most this many bytes: larger files belong in the interface. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

const fromBase64 = (text: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(text.replace(/\s/g, "")), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

export const uploadFile = defineTool({
  name: "upload_file",
  title: "Datei ablegen",
  description:
    "Legt eine kleine Datei aus dem Gespräch ab (bis 1 MB): Text als „text“ (UTF-8), alles andere, etwa ein Bild, als „base64“. Große Dateien gehören über die Oberfläche hochgeladen.",
  input: {
    name: nodeNameSchema.describe("Der Dateiname mit Endung"),
    parentId,
    text: z.string().optional(),
    base64: z.string().optional(),
  },
  writes: true,
  run: (context, input) => {
    if ((input.text === undefined) === (input.base64 === undefined)) {
      return Promise.resolve(failure("Gib entweder „text“ oder „base64“ an."));
    }
    const content =
      input.text !== undefined ? new TextEncoder().encode(input.text) : fromBase64(input.base64 ?? "");
    if (!content) return Promise.resolve(failure("„base64“ ist kein Base64."));
    if (content.byteLength > MAX_UPLOAD_BYTES) {
      return Promise.resolve(failure("Die Datei ist größer als 1 MB; lade sie über die Oberfläche hoch."));
    }
    return store(context, input.name, content, input.parentId);
  },
});

export const CREATE_TOOLS = [
  listTemplates,
  createDocument,
  createFromTemplate,
  createSheet,
  createPresentation,
  appendRows,
  uploadFile,
] as const;
