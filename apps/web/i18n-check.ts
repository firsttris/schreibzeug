/**
 * Keeps the interface translated: every text a person reads comes from messages/<locale>.json
 * (Paraglide, project.inlang), German and English carry the same messages with the same
 * placeholders, and no message is left over. i18n.test.ts runs these checks in `bun run test`;
 * `bun i18n-check.ts [file …]` lists what the code still says itself.
 *
 * Text in the code is found by its shape: JSX text, the attributes and object fields that hold
 * labels, and string literals with German letters or words. A literal that only looks like text (a
 * file name, a value the engine or server reads) is marked with an `i18n-ignore` comment on its
 * line or the line before.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";

export type Messages = Record<string, string>;

export type Finding = { file: string; line: number; text: string };

/** The attributes and object fields whose string is read by a person. */
const TEXT_NAMES = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "alt",
  "title",
  "placeholder",
  "label",
  "hint",
  "description",
  "tooltip",
  "message",
  "notice",
]);

/** Letters only German has, typographic German quotes, and words that occur in nearly every German sentence. */
const GERMAN =
  /[äöüÄÖÜß„“]|\b(und|oder|nicht|der|die|das|den|dem|ein|eine|einen|mit|für|von|zum|zur|ist|sind|wird|kann|noch|Datei|Dateien|Ordner|Seite|Zeile|Spalte|Folie|Fehler|Neu|Öffnen|Speichern|Löschen|Abbrechen|Schließen)\b/;

const HAS_WORD = /\p{L}{2,}/u;

const IGNORE = "i18n-ignore";

/** The keys of a messages file without its "$schema". */
export const messageKeys = (messages: Messages): string[] =>
  Object.keys(messages).filter((key) => key !== "$schema");

/** The `{name}` placeholders of a message, sorted. */
export const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

/** Messages one locale has and the other lacks, empty ones, and ones whose placeholders differ. */
export const compareLocales = (base: Messages, other: Messages, otherName: string): string[] => {
  const problems: string[] = [];
  for (const key of messageKeys(base)) {
    const value = other[key];
    if (value === undefined) problems.push(`${key}: missing in ${otherName}`);
    else if (value.trim() === "") problems.push(`${key}: empty in ${otherName}`);
    else if (placeholders(value).join() !== placeholders(base[key] ?? "").join())
      problems.push(`${key}: other placeholders in ${otherName}`);
  }
  for (const key of messageKeys(other)) if (!(key in base)) problems.push(`${key}: only in ${otherName}`);
  for (const key of messageKeys(base)) if ((base[key] ?? "").trim() === "") problems.push(`${key}: empty`);
  return problems;
};

/** The message keys the sources call as `m.key(` or `m["key"](`. */
export const usedKeys = (sources: string[]): Set<string> => {
  const used = new Set<string>();
  for (const source of sources)
    for (const match of source.matchAll(/\bm(?:\.(\w+)|\[["'](\w+)["']\])/g))
      used.add(match[1] ?? match[2] ?? "");
  return used;
};

type Node = { type: string; loc?: { start: { line: number } } | null; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

const children = (node: Node): Node[] =>
  Object.entries(node).flatMap(([key, value]) =>
    key === "loc" || key === "comments" || key.endsWith("Comments")
      ? []
      : Array.isArray(value)
        ? value.filter(isNode)
        : isNode(value)
          ? [value]
          : [],
  );

const nameOf = (node: Node | undefined): string | undefined => {
  if (!node) return undefined;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name as string;
  if (node.type === "StringLiteral") return node.value as string;
  return undefined;
};

/** A string's text, if the node is a string literal or a template without expressions in the way. */
const stringOf = (node: Node | undefined): string | undefined => {
  if (!node) return undefined;
  if (node.type === "StringLiteral") return node.value as string;
  if (node.type === "TemplateLiteral")
    return (node.quasis as Node[]).map((quasi) => (quasi.value as { cooked: string }).cooked).join(" ");
  if (node.type === "JSXExpressionContainer") return stringOf(node.expression as Node);
  return undefined;
};

/** What in one source file reads like interface text written in the code. */
export const findTexts = (file: string, source: string): Finding[] => {
  const lines = source.split("\n");
  const ignored = (line: number) =>
    (lines[line - 1] ?? "").includes(IGNORE) || (lines[line - 2] ?? "").includes(IGNORE);
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] }) as unknown as Node;
  const findings: Finding[] = [];
  const report = (node: Node, text: string) => {
    const line = node.loc?.start.line ?? 0;
    if (!ignored(line)) findings.push({ file, line, text: text.trim().slice(0, 80) });
  };
  const labelled = new Set<Node>();
  const visit = (node: Node) => {
    if (node.type === "JSXText") {
      const text = node.value as string;
      if (HAS_WORD.test(text)) report(node, text);
    } else if (node.type === "JSXAttribute") {
      const value = stringOf(node.value as Node);
      if (TEXT_NAMES.has(nameOf(node.name as Node) ?? "") && value && HAS_WORD.test(value)) {
        report(node, value);
        labelled.add(node.value as Node);
      }
    } else if (node.type === "ObjectProperty") {
      const value = stringOf(node.value as Node);
      if (TEXT_NAMES.has(nameOf(node.key as Node) ?? "") && value && HAS_WORD.test(value)) {
        report(node, value);
        labelled.add(node.value as Node);
      }
    } else if ((node.type === "StringLiteral" || node.type === "TemplateLiteral") && !labelled.has(node)) {
      const value = stringOf(node);
      if (value && GERMAN.test(value)) report(node, value);
    }
    for (const child of children(node)) {
      if (labelled.has(node)) labelled.add(child);
      visit(child);
    }
  };
  visit(ast);
  return findings;
};

/** The interface's source files: apps/web/src without tests and without the compiled messages. */
export const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "paraglide" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [path]
      : [];
  });

if (import.meta.main) {
  const root = import.meta.dirname;
  const files = process.argv.length > 2 ? process.argv.slice(2) : sourceFiles(join(root, "src"));
  const findings = files.flatMap((file) =>
    findTexts(relative(process.cwd(), file), readFileSync(file, "utf8")),
  );
  for (const { file, line, text } of findings) console.log(`${file}:${line}  ${text}`);
  console.log(`${findings.length} text(s) in the code`);
}
