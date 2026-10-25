import type { EditorKind } from "./frame";
import type { SearchCommands } from "./search";

/*
 * Jobs an assistant gives the open editor (plan "MCP-Server", phase 4), run as scripts against the
 * engine's builder API (word/apiBuilder.js, cell/apiBuilder.js, slide/apiBuilder.js: Api,
 * ApiDocument, ApiWorksheet, ApiPresentation). The engine runs them through its plugin command
 * (common/apiBase.js callCommand → common/plugins.js callCommandInternal): canRunBuilderScript
 * starts one action (StartAction, CheckActionLock), _onEndBuilderScript recalculates and finishes
 * it (FinalizeAction). So a job is one step of the history, which "Rückgängig" takes back, and in a
 * shared session its changes lock and travel through the relay as typed ones do.
 *
 * A script gets its input as a JSON literal and returns plain data (Asc.checkReturnCommand drops
 * anything else); the texts for the assistant are written here from that data.
 */

/** A stretch of text with its marks (files-api agentRunSchema). */
export type AgentRun = { text: string; bold?: boolean | undefined; italic?: boolean | undefined };

/** A paragraph to insert (files-api agentBlockSchema). */
export type AgentBlock = {
  kind: "heading" | "paragraph" | "bullet" | "number";
  level: number;
  runs: AgentRun[];
};

export type AgentPosition = "end" | { before: number } | { after: number };

/** The jobs the engine runs (files-api agentCommandSchema, without exportPdf, which the app does). */
export type AgentCommand =
  | { type: "outline" }
  | { type: "replaceText"; search: string; replace: string; matchCase: boolean }
  | { type: "insertContent"; blocks: AgentBlock[]; position: AgentPosition }
  | {
      type: "setCells";
      sheet?: string | undefined;
      range: string;
      values: (string | number | boolean | null)[][];
    };

/** What a job answers: a text for the assistant, or why it did not run. */
export type AgentOutcome = { ok: true; text: string } | { ok: false; text: string };

const done = (text: string): AgentOutcome => ({ ok: true, text });
const refused = (text: string): AgentOutcome => ({ ok: false, text });

/** What a job runs against: the builder, and the search the editor's search bar uses. */
export type AgentEngine = { runBuilder: RunBuilder; search?: SearchCommands | null | undefined };

/**
 * A script and how its return value becomes the answer, or a job done with the editor's own
 * commands where a script cannot do it.
 */
type Job =
  | { script: string; answer: (value: unknown) => AgentOutcome }
  | { direct: (engine: AgentEngine) => Promise<AgentOutcome> };

/** The input as a literal the script starts with; JSON is valid JavaScript. */
const withInput = (input: unknown, body: string): string =>
  `const input = ${JSON.stringify(input)};\n${body}`;

// --- Text documents --------------------------------------------------------------------------------

type WordElement = { type: string; text?: string; style?: string; rows?: number };

const WORD_OUTLINE = `
const doc = Api.GetDocument();
const items = [];
for (let i = 0; i < doc.GetElementsCount(); i++) {
  const element = doc.GetElement(i);
  const type = element.GetClassType();
  if (type === "paragraph") {
    const style = element.GetStyle ? element.GetStyle() : null;
    items.push({ type: type, text: element.GetText(), style: style ? style.GetName() : "" });
  } else if (type === "table") {
    items.push({ type: type, rows: element.GetRowsCount() });
  } else {
    items.push({ type: type });
  }
}
return items;`;

const SHOWN = 160;
const shortened = (text: string) => (text.length > SHOWN ? `${text.slice(0, SHOWN)} …` : text);

const wordOutlineText = (items: WordElement[]): string =>
  items
    .map((item, index) => {
      const number = `${index + 1}.`;
      if (item.type === "paragraph") {
        const style = item.style && item.style !== "Normal" ? ` [${item.style}]` : "";
        const text = (item.text ?? "").replace(/\s+$/, "");
        return `${number}${style} ${text ? shortened(text) : "(leer)"}`;
      }
      if (item.type === "table") return `${number} [Tabelle, ${item.rows ?? 0} Zeilen]`;
      return `${number} [${item.type}]`;
    })
    .join("\n");

/**
 * Builds each paragraph with the builder (Api.CreateParagraph, AddText → ApiRun SetBold/SetItalic),
 * gives headings Word's "Heading n" style and list items a numbering (CreateNumbering "bullet" or
 * "numbered", one for each list), then puts them in at the index (ApiDocumentContent.AddElement).
 */
const WORD_INSERT = `
const doc = Api.GetDocument();
const count = doc.GetElementsCount();
const at = input.position === "end" ? count : input.position.before !== undefined ? input.position.before - 1 : input.position.after;
if (at < 0 || at > count) return { error: count };
let bullets = null;
let numbers = null;
let previous = "";
input.blocks.forEach(function (block, index) {
  const paragraph = Api.CreateParagraph();
  block.runs.forEach(function (part) {
    const run = paragraph.AddText(part.text);
    if (part.bold) run.SetBold(true);
    if (part.italic) run.SetItalic(true);
  });
  if (block.kind === "heading") {
    const style = doc.GetStyle("Heading " + block.level);
    if (style) paragraph.SetStyle(style);
  } else if (block.kind === "bullet") {
    if (!bullets || previous !== "bullet") bullets = doc.CreateNumbering("bullet");
    paragraph.SetNumbering(bullets.GetLevel(block.level));
  } else if (block.kind === "number") {
    if (!numbers || previous !== "number") numbers = doc.CreateNumbering("numbered");
    paragraph.SetNumbering(numbers.GetLevel(block.level));
  }
  previous = block.kind;
  doc.AddElement(at + index, paragraph);
});
return { inserted: input.blocks.length, at: at + 1 };`;

/**
 * Replacing goes the search bar's way (word/api.js asc_replaceText), not the builder's
 * SearchAndReplace: in a shared session ReplaceSearchElement asks the relay for locks and sets the
 * global lock until it answers, and the builder action around it would then see that lock and undo
 * itself (Document.js private_CheckActionLock, StartSelectionLockCheck). On its own it is an
 * action of its own, which undo takes back in one step.
 */
const replaceAll = async (
  { search }: AgentEngine,
  { search: text, replace, matchCase }: Extract<AgentCommand, { type: "replaceText" }>,
): Promise<AgentOutcome> => {
  if (!search) return refused("Suchen und Ersetzen geht in diesem Editor nicht.");
  const query = { text, matchCase, wholeWords: false };
  const count = search.find(query, true);
  if (count > 0) search.replaceAll(query, replace);
  search.end();
  return count === 0
    ? done(`„${text}“ kommt im Dokument nicht vor; nichts ersetzt.`)
    : done(`${count}-mal ersetzt.`);
};

const wordJob = (command: AgentCommand): Job | AgentOutcome => {
  switch (command.type) {
    case "outline":
      return {
        script: WORD_OUTLINE,
        answer: (value) =>
          Array.isArray(value)
            ? done(wordOutlineText(value as WordElement[]))
            : refused("Die Gliederung fehlt."),
      };
    case "replaceText":
      return { direct: (engine) => replaceAll(engine, command) };
    case "insertContent":
      return {
        script: withInput(command, WORD_INSERT),
        answer: (value) => {
          const result = value as { inserted?: number; at?: number; error?: number } | undefined;
          if (result?.error !== undefined)
            return refused(
              `Diese Stelle gibt es nicht: Das Dokument hat ${result.error} Elemente (outline).`,
            );
          return done(`${result?.inserted ?? 0} Absätze eingefügt, ab Element ${result?.at ?? "?"}.`);
        },
      };
    default:
      return refused("Das geht nur in einer Tabelle.");
  }
};

// --- Spreadsheets ----------------------------------------------------------------------------------

const columnIndex = (letters: string): number =>
  [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

const columnName = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : columnName(Math.floor(index / 26) - 1) + columnName(index % 26);

/** The range the values fill, from the top left cell of `range`: "B2" with 2 × 3 values → "B2:D3". */
export const filledRange = (range: string, values: unknown[][]): string => {
  const [, letters = "A", row = "1"] = /^([A-Z]+)(\d+)/.exec(range.toUpperCase()) ?? [];
  const width = Math.max(1, ...values.map((cells) => cells.length));
  const left = columnIndex(letters);
  const top = Number(row);
  return `${letters}${top}:${columnName(left + width - 1)}${top + values.length - 1}`;
};

const CELL_OUTLINE = `
const active = Api.GetActiveSheet().GetName();
return Api.GetSheets().map(function (sheet) {
  const used = sheet.GetUsedRange();
  return { name: sheet.GetName(), active: sheet.GetName() === active, used: used ? used.GetAddress(false, false) : "" };
});`;

const CELL_SET = `
const sheet = input.sheet ? Api.GetSheet(input.sheet) : Api.GetActiveSheet();
if (!sheet) return { error: "sheet" };
const width = input.values.reduce(function (most, row) { return Math.max(most, row.length); }, 1);
// SetValue writes every value as text the sheet then reads in its language (cell/apiBuilder.js
// checkFormat, Range.setValue): a number needs the decimal separator of the document's locale.
const culture = AscCommon.g_oDefaultCultureInfo;
const separator = (culture && culture.NumberDecimalSeparator) || ".";
const asText = function (value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return String(value).replace(".", separator);
  if (typeof value === "boolean") return value ? "=TRUE()" : "=FALSE()";
  return value;
};
const values = input.values.map(function (row) {
  const full = [];
  for (let i = 0; i < width; i++) full.push(asText(row[i]));
  return full;
});
const written = sheet.GetRange(input.target).SetValue(values);
return written === false ? { error: "protected" } : { sheet: sheet.GetName(), range: input.target };`;

const cellJob = (command: AgentCommand): Job | AgentOutcome => {
  switch (command.type) {
    case "outline":
      return {
        script: CELL_OUTLINE,
        answer: (value) =>
          done(
            ((value ?? []) as { name: string; active: boolean; used: string }[])
              .map(
                (sheet) => `Blatt „${sheet.name}“${sheet.active ? " (aktiv)" : ""}: ${sheet.used || "leer"}`,
              )
              .join("\n"),
          ),
      };
    case "setCells": {
      const target = filledRange(command.range, command.values);
      return {
        script: withInput({ ...command, target }, CELL_SET),
        answer: (value) => {
          const result = value as { error?: string; sheet?: string; range?: string } | undefined;
          if (result?.error === "sheet") return refused(`Ein Blatt „${command.sheet ?? ""}“ gibt es nicht.`);
          if (result?.error === "protected") return refused("Der Bereich ist geschützt.");
          return done(`${result?.range ?? target} auf Blatt „${result?.sheet ?? ""}“ gesetzt.`);
        },
      };
    }
    default:
      return refused("Das geht nur in einem Textdokument.");
  }
};

// --- Presentations ---------------------------------------------------------------------------------

const SLIDE_OUTLINE = `
const presentation = Api.GetPresentation();
const slides = [];
for (let i = 0; i < presentation.GetSlidesCount(); i++) {
  const texts = [];
  presentation.GetSlideByIndex(i).GetAllShapes().forEach(function (shape) {
    const content = shape.GetDocContent();
    if (!content) return;
    content.GetAllParagraphs().forEach(function (paragraph) {
      const text = paragraph.GetText();
      if (text.trim()) texts.push(text.trim());
    });
  });
  slides.push(texts);
}
return slides;`;

const slideJob = (command: AgentCommand): Job | AgentOutcome =>
  command.type === "outline"
    ? {
        script: SLIDE_OUTLINE,
        answer: (value) =>
          done(
            ((value ?? []) as string[][])
              .map((texts, index) => `Folie ${index + 1}: ${texts.map(shortened).join(" · ") || "(leer)"}`)
              .join("\n"),
          ),
      }
    : refused("Das geht in Präsentationen noch nicht.");

const JOBS: Partial<Record<EditorKind, (command: AgentCommand) => Job | AgentOutcome>> = {
  word: wordJob,
  cell: cellJob,
  slide: slideJob,
};

/** Runs builder code in the engine (OpenedDocument.runBuilder). */
export type RunBuilder = (script: string) => Promise<unknown>;

/** Runs a job in the open document and answers it. */
export const runAgentCommand = async (
  engine: AgentEngine,
  editor: EditorKind,
  command: AgentCommand,
): Promise<AgentOutcome> => {
  const job = JOBS[editor]?.(command) ?? refused("In diesem Editor kann Claude noch nichts tun.");
  if ("ok" in job) return job;
  try {
    if ("direct" in job) return await job.direct(engine);
    // The engine evaluates the text as it is; a function around it lets the script return.
    return job.answer(await engine.runBuilder(`(function () {\n${job.script}\n})();`));
  } catch (error) {
    return refused(
      `Die Engine hat den Auftrag nicht ausgeführt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
