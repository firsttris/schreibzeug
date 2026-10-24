import type { FileNode } from "@schreibzeug/files-api";
import type { Template, TemplateFormat } from "@schreibzeug/ooxml";
import { isEditable, kindOf } from "../lib/format";

/**
 * Where people keep their own templates: a folder of this name at the top of their files. Every
 * document, spreadsheet and presentation in it is offered beside the built-in ones; nothing else
 * needs setting up, here as on a Schreibzeug server or on the computer.
 */
export const TEMPLATE_FOLDER = "Vorlagen";

/** A template to start from: one of ours, or a file of the user's "Vorlagen" folder. */
export type TemplateChoice =
  | { kind: "builtin"; template: Template }
  | { kind: "own"; node: FileNode; format: TemplateFormat };

export const templateFolderOf = (topLevel: FileNode[]): FileNode | null =>
  topLevel.find(
    (node) => node.kind === "folder" && node.name.toLowerCase() === TEMPLATE_FOLDER.toLowerCase(),
  ) ?? null;

export const ownTemplates = (inFolder: FileNode[]): TemplateChoice[] =>
  inFolder.filter(isEditable).map((node) => ({ kind: "own", node, format: kindOf(node) as TemplateFormat }));

const baseName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

export const choiceName = (choice: TemplateChoice): string =>
  choice.kind === "builtin" ? choice.template.name : baseName(choice.node.name);

export const formatOf = (choice: TemplateChoice): TemplateFormat =>
  choice.kind === "builtin" ? choice.template.format : choice.format;

export const choiceKey = (choice: TemplateChoice): string =>
  choice.kind === "builtin" ? `builtin:${choice.template.id}` : `own:${choice.node.id}`;

/** The new file's name: what was typed, with the template's extension unless it is there already. */
export const fileNameFor = (name: string, format: TemplateFormat): string =>
  name.toLowerCase().endsWith(`.${format}`) ? name : `${name}.${format}`;
