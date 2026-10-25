import {
  AGENT_NOT_OPEN,
  type AgentCommand,
  agentPositionSchema,
  agentResultSchema,
  nodeIdSchema,
} from "@schreibzeug/files-api";
import { markdownParagraphs } from "@schreibzeug/ooxml";
import { z } from "zod";
import { failure, json, mapOutcome, type Outcome, withJson } from "../api";
import { linkTo } from "../present";
import { CONTENT_IS_DATA, defineTool, type ToolContext } from "../tool";

/*
 * Editing in the open tab (plan "MCP-Server", phase 4): the server hands the job to the tab that
 * has the document open (apps/server src/agent), the engine runs it there with undo, and anyone
 * editing along sees it through the relay; the tab saves it as a new version. Without an open tab
 * the answer is the link to open the document, then the same call works.
 */

const id = nodeIdSchema.describe("Die ID des Dokuments");

const NOT_OPEN_HINT = (link: string) =>
  `${AGENT_NOT_OPEN} Bitte öffne es in Schreibzeug (${link}); dann rufe das Werkzeug noch einmal auf.`;

const withLink = ({ origin }: ToolContext, fileId: string, outcome: Outcome<string>): Outcome<string> =>
  !outcome.ok && outcome.message === AGENT_NOT_OPEN
    ? failure(NOT_OPEN_HINT(linkTo(origin, { id: fileId, kind: "file" })))
    : outcome;

const run = async (context: ToolContext, fileId: string, command: AgentCommand) =>
  withLink(
    context,
    fileId,
    mapOutcome(
      await json(context.api(`/api/files/${fileId}/agent`, withJson("POST", { command })), agentResultSchema),
      (result) => result.text,
    ),
  );

export const outline = defineTool({
  name: "outline",
  title: "Gliederung im offenen Dokument",
  description: `Die Gliederung des Dokuments, so wie es gerade im Editor offen ist (mit ungespeicherten Änderungen): bei Text die Absätze und Tabellen mit Nummern für insert_content, bei Tabellen die Blätter mit ihrem benutzten Bereich, bei Präsentationen die Folien mit ihrem Text. Das Dokument muss in einem Tab offen sein. ${CONTENT_IS_DATA}`,
  input: { id },
  writes: false,
  run: async (context, { id }) =>
    withLink(
      context,
      id,
      mapOutcome(
        await json(context.api(`/api/files/${id}/outline`), agentResultSchema),
        (result) => result.text,
      ),
    ),
});

export const replaceText = defineTool({
  name: "replace_text",
  title: "Suchen und Ersetzen",
  description:
    "Ersetzt in einem offenen Word-Dokument jedes Vorkommen eines Textes. Die Änderung ist im Editor sichtbar, lässt sich dort rückgängig machen und wird als neue Version gespeichert. Die Antwort nennt, wie oft ersetzt wurde.",
  input: {
    id,
    search: z.string().min(1).max(1000).describe("Der gesuchte Text"),
    replace: z.string().max(10_000).describe("Der neue Text"),
    matchCase: z.boolean().default(true).describe("Groß- und Kleinschreibung beachten"),
  },
  writes: true,
  run: (context, { id, ...input }) => run(context, id, { type: "replaceText", ...input }),
});

export const insertContent = defineTool({
  name: "insert_content",
  title: "Text einfügen",
  description:
    "Fügt in einem offenen Word-Dokument Markdown ein: Überschriften (#), Absätze, Aufzählungen (-) und nummerierte Listen (1.), **fett** und *kursiv*. Die Stelle ist vor oder nach dem n-ten Element der Gliederung (outline) oder das Ende. Sichtbar im Editor, rückgängig zu machen, als neue Version gespeichert.",
  input: {
    id,
    markdown: z.string().min(1).max(200_000),
    position: agentPositionSchema
      .default("end")
      .describe("„end“, {after: n} oder {before: n}, n aus outline"),
  },
  writes: true,
  run: (context, { id, markdown, position }) =>
    run(context, id, { type: "insertContent", blocks: markdownParagraphs(markdown), position }),
});

export const setCells = defineTool({
  name: "set_cells",
  title: "Zellen setzen",
  description:
    "Schreibt in einer offenen Excel-Tabelle Werte und Formeln ab der linken oberen Zelle des Bereichs: Zeilen von Zellen, Zahl, Text, Wahrheitswert, Formel mit „=“ (englische Funktionsnamen) oder null für eine leere Zelle. Sichtbar im Editor, rückgängig zu machen, als neue Version gespeichert.",
  input: {
    id,
    sheet: z.string().optional().describe("Der Name des Blatts; leer für das aktive"),
    range: z.string().describe("Die linke obere Zelle oder der Bereich, z. B. „B2“"),
    values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1),
  },
  writes: true,
  run: (context, { id, ...input }) => run(context, id, { type: "setCells", ...input }),
});

export const exportPdf = defineTool({
  name: "export_pdf",
  title: "Als PDF ablegen",
  description:
    "Legt ein offenes Dokument als PDF (oder PDF/A zum Archivieren) neben dem Original ab, so wie es gedruckt aussieht. Die Antwort nennt die neue Datei.",
  input: { id, pdfa: z.boolean().default(false).describe("PDF/A statt PDF") },
  writes: true,
  run: (context, { id, pdfa }) => run(context, id, { type: "exportPdf", pdfa }),
});

export const EDIT_TOOLS = [outline, replaceText, insertContent, setCells, exportPdf] as const;
