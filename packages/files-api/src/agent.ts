import { z } from "zod";

/*
 * Jobs for an open editor ("Agenten-Aufträge"): an MCP tool asks the server, the server hands the
 * job to the tab that has the document open, the tab runs it in the engine and answers. The
 * shapes here are the contract between all three (apps/server src/agent, packages/mcp,
 * apps/web src/editor/use-agent.tsx).
 */

/** "A1", "B2:D10": a cell or a range of a sheet. */
const cellRange = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{1,3}\d{1,7}(:[A-Z]{1,3}\d{1,7})?$/,
    "Der Bereich ist keiner (Beispiel: „A1“ oder „B2:D10“).",
  );

/** Where something goes in a text document: before or after the n-th element (from 1), or at the end. */
export const agentPositionSchema = z.union([
  z.literal("end"),
  z.object({ before: z.number().int().positive() }),
  z.object({ after: z.number().int().positive() }),
]);

/** A stretch of text with the marks it has. */
export const agentRunSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
});

/**
 * A paragraph to insert: a heading (level 1–6), a plain paragraph, or an item of a bullet or a
 * numbered list (level from 0).
 */
export const agentBlockSchema = z.object({
  kind: z.enum(["heading", "paragraph", "bullet", "number"]),
  level: z.number().int().min(0).max(8).default(0),
  runs: z.array(agentRunSchema).max(10_000),
});

export const agentCommandSchema = z.discriminatedUnion("type", [
  /** What the document consists of, numbered to address it. */
  z.object({ type: z.literal("outline") }),
  /** Find and replace in a text document. */
  z.object({
    type: z.literal("replaceText"),
    search: z.string().min(1).max(1000),
    replace: z.string().max(10_000),
    matchCase: z.boolean().default(true),
  }),
  /** Paragraphs into a text document (packages/mcp makes them from Markdown with ooxml). */
  z.object({
    type: z.literal("insertContent"),
    blocks: z.array(agentBlockSchema).min(1).max(5000),
    position: agentPositionSchema.default("end"),
  }),
  /** Values and formulas into a sheet, from the top left cell of `range`. */
  z.object({
    type: z.literal("setCells"),
    sheet: z.string().optional(),
    range: cellRange,
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .min(1)
      .max(10_000),
  }),
  /** The document as PDF (or PDF/A), stored by the tab as a new file beside it. */
  z.object({ type: z.literal("exportPdf"), pdfa: z.boolean().default(false) }),
]);

export type AgentCommand = z.infer<typeof agentCommandSchema>;
export type AgentPosition = z.infer<typeof agentPositionSchema>;
export type AgentBlock = z.infer<typeof agentBlockSchema>;

/** A job as the server sends it to the tab. */
export const agentJobSchema = z.object({
  type: z.literal("job"),
  id: z.string(),
  command: agentCommandSchema,
});

/** What the tab answers: a text for the model, or why it did not run. */
export const agentReplySchema = z.object({
  type: z.literal("result"),
  id: z.string(),
  ok: z.boolean(),
  text: z.string(),
});

export type AgentJob = z.infer<typeof agentJobSchema>;
export type AgentReply = z.infer<typeof agentReplySchema>;

/** The answer of the API to a job: what the tab answered. */
export const agentResultSchema = z.object({ text: z.string() });

/** The API's message when no tab has the document open; the MCP tool adds the link to open it. */
export const AGENT_NOT_OPEN = "Das Dokument ist gerade in keinem Tab geöffnet.";
