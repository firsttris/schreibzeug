import { nodeIdSchema, nodeSchema } from "@schreibzeug/files-api";
import { decodeText, encodeText, sha256Hex } from "@schreibzeug/text-editor/codec";
import { z } from "zod";
import { bytes, failure, json, mapOutcome, withBytes } from "../api";
import { asText, presentNode } from "../present";
import { defineTool } from "../tool";

const TEXT_EXTENSIONS = [".md", ".txt"] as const;

const concat = (first: Uint8Array, second: Uint8Array) => {
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first);
  bytes.set(second, first.length);
  return bytes;
};

/**
 * Writes a Markdown note or a text file as the text editor does (apps/web text-view.tsx): in the
 * file's own encoding and line endings, and only over the version it read, so a save someone made
 * in between is not overwritten.
 */
export const writeText = defineTool({
  name: "write_text",
  title: "Text schreiben",
  description:
    "Schreibt den Text einer Markdown-Notiz (.md) oder Textdatei (.txt): „replace“ ersetzt den ganzen Text, „append“ hängt ihn an. Zeichenkodierung und Zeilenenden der Datei bleiben, wie sie sind; das Ergebnis ist eine neue Version. Lies die Datei vorher mit read_document. Neue Notizen legt upload_file mit „text“ an.",
  input: {
    id: nodeIdSchema.describe("Die ID der Datei"),
    text: z.string().max(500_000).describe("Der Text, Zeilen mit \\n getrennt"),
    mode: z.enum(["replace", "append"]).default("replace"),
  },
  writes: true,
  run: async ({ api, origin }, { id, text, mode }) => {
    const node = await json(api(`/api/nodes/${id}`), nodeSchema);
    if (!node.ok) return node;
    const name = node.value.name.toLowerCase();
    if (node.value.kind !== "file" || !TEXT_EXTENSIONS.some((extension) => name.endsWith(extension)))
      return failure("write_text schreibt nur Markdown-Notizen (.md) und Textdateien (.txt).");
    const content = await bytes(api(`/api/files/${id}/content`));
    if (!content.ok) return content;
    const current = decodeText(content.value);
    const separator = current.text === "" || current.text.endsWith("\n") ? "" : "\n";
    // Appending leaves the bytes there as they are (also lines with another ending than most).
    const appending = mode === "append";
    const encoded = encodeText(appending ? `${separator}${text}` : text, {
      ...current.form,
      bom: current.form.bom && (!appending || content.value.length === 0),
    });
    if (!encoded.ok)
      return failure(
        `„${encoded.character}“ lässt sich in der Zeichenkodierung dieser Datei nicht speichern.`,
      );
    const save = withBytes(appending ? concat(content.value, encoded.bytes) : encoded.bytes);
    const headers = {
      ...(save.headers as Record<string, string>),
      "if-match": `"${await sha256Hex(content.value)}"`,
    };
    return mapOutcome(
      await json(api(`/api/files/${id}/content`, { ...save, headers }), nodeSchema),
      (saved) => asText(presentNode(origin, saved)),
    );
  },
});

export const TEXT_TOOLS = [writeText] as const;
