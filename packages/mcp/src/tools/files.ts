import {
  type FileNode,
  folderListingSchema,
  inviteSchema,
  nodeIdSchema,
  nodeNameSchema,
  nodeSchema,
  sharedNodeSchema,
  shareRoleSchema,
  shareSchema,
  versionSchema,
} from "@schreibzeug/files-api";
import { z } from "zod";
import { failure, json, mapOutcome, type Outcome, withJson } from "../api";
import { asText, presentNode, presentVersion } from "../present";
import { defineTool, type RunContext } from "../tool";

const id = nodeIdSchema.describe("Die ID der Datei oder des Ordners");
const nodes = nodeSchema.array();

/** Who a node is shared with; "pending" marks an address without an account yet, which waits for it. */
const presentShare = ({ name, email, role, pending, unverified }: z.infer<typeof shareSchema>) => ({
  name,
  email,
  role,
  ...(pending ? { pending } : {}),
  // Whoever signed up with the address has not confirmed it (docs/accounts.md, Sharing).
  ...(unverified ? { unverified } : {}),
});

/** Folders and files: what the file list of the app does, through the same API. */
export const listFolder = defineTool({
  name: "list_folder",
  title: "Ordner auflisten",
  description:
    "Listet einen Ordner auf: „root“ für „Meine Dateien“, „shared“ für „Mit mir geteilt“, „recent“ für zuletzt geänderte Dateien, „trash“ für den Papierkorb, sonst die ID eines Ordners. Jeder Eintrag hat ID, Art, Größe, Änderungsdatum, Recht und einen Link zum Öffnen.",
  input: {
    folder: z
      .union([z.enum(["root", "shared", "recent", "trash"]), nodeIdSchema])
      .default("root")
      .describe("„root“, „shared“, „recent“, „trash“ oder die ID eines Ordners"),
  },
  writes: false,
  run: async ({ api, origin }, { folder }) => {
    const present = (list: z.infer<typeof nodes>) => asText(list.map((node) => presentNode(origin, node)));
    if (folder === "shared") {
      return mapOutcome(await json(api("/api/shared"), sharedNodeSchema.array()), (list) =>
        asText(list.map((node) => ({ ...presentNode(origin, node), owner: node.ownerName }))),
      );
    }
    if (folder === "recent") return mapOutcome(await json(api("/api/recent"), nodes), present);
    if (folder === "trash") return mapOutcome(await json(api("/api/trash"), nodes), present);
    const parent = folder === "root" ? "root" : folder;
    return mapOutcome(await json(api(`/api/nodes?parent=${parent}`), folderListingSchema), (listing) =>
      asText({
        folder: listing.folder ? presentNode(origin, listing.folder) : { name: "Meine Dateien", id: "root" },
        path: listing.path.map((node) => node.name).join(" / "),
        children: listing.children.map((node) => presentNode(origin, node)),
      }),
    );
  },
});

export const searchFiles = defineTool({
  name: "search_files",
  title: "Dateien suchen",
  description:
    "Findet Dateien und Ordner nach ihrem Namen (Teil des Namens genügt, Groß- und Kleinschreibung egal), in den eigenen und den mit dir geteilten.",
  input: { query: z.string().trim().min(1).max(200).describe("Ein Teil des Namens") },
  writes: false,
  run: async ({ api, origin }, { query }) =>
    mapOutcome(await json(api(`/api/search?q=${encodeURIComponent(query)}`), nodes), (list) =>
      list.length === 0 ? "Nichts gefunden." : asText(list.map((node) => presentNode(origin, node))),
    ),
});

export const getFile = defineTool({
  name: "get_file",
  title: "Angaben zu einer Datei",
  description:
    "Angaben zu einer Datei oder einem Ordner: Name, Art, Größe, Version, Pfad, Recht, mit wem sie geteilt ist (nur für den Besitzer) und der Link zum Öffnen in Schreibzeug.",
  input: { id },
  writes: false,
  run: async ({ api, origin }, { id }) => {
    const node = await json(api(`/api/nodes/${id}`), nodeSchema);
    if (!node.ok) return node;
    const parent = node.value.parentId
      ? await json(api(`/api/nodes?parent=${node.value.parentId}`), folderListingSchema)
      : null;
    const path = parent?.ok ? parent.value.path.map((folder) => folder.name) : [];
    const shares =
      node.value.role === "owner" ? await json(api(`/api/nodes/${id}/shares`), shareSchema.array()) : null;
    return mapOutcome(node, (value) =>
      asText({
        ...presentNode(origin, value),
        mime: value.mime,
        createdAt: value.createdAt,
        path: path.length > 0 ? path.join(" / ") : "Meine Dateien",
        ...(shares?.ok ? { sharedWith: shares.value.map(presentShare) } : {}),
      }),
    );
  },
});

export const createFolder = defineTool({
  name: "create_folder",
  title: "Ordner anlegen",
  description: "Legt einen Ordner an, in „Meine Dateien“ oder in einem Ordner.",
  input: {
    name: nodeNameSchema.describe("Der Name des neuen Ordners"),
    parentId: nodeIdSchema
      .nullable()
      .default(null)
      .describe("Der Ordner, in den er kommt; leer für „Meine Dateien“"),
  },
  writes: true,
  run: async ({ api, origin }, input) =>
    mapOutcome(await json(api("/api/folders", withJson("POST", input)), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    ),
});

export const rename = defineTool({
  name: "rename",
  title: "Umbenennen",
  description: "Gibt einer Datei oder einem Ordner einen neuen Namen; die Endung einer Datei gehört dazu.",
  input: { id, name: nodeNameSchema.describe("Der neue Name") },
  writes: true,
  run: async ({ api, origin }, { id, name }) =>
    mapOutcome(await json(api(`/api/nodes/${id}`, withJson("PATCH", { name })), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    ),
});

export const move = defineTool({
  name: "move",
  title: "Verschieben",
  description:
    "Verschiebt eine Datei oder einen Ordner in einen anderen Ordner (oder nach „Meine Dateien“). Nur der Besitzer darf das, und nur innerhalb seiner eigenen Dateien.",
  input: {
    id,
    parentId: nodeIdSchema.nullable().describe("Der Zielordner; leer für „Meine Dateien“"),
  },
  writes: true,
  run: async ({ api, origin }, { id, parentId }) =>
    mapOutcome(await json(api(`/api/nodes/${id}`, withJson("PATCH", { parentId })), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    ),
});

export const copy = defineTool({
  name: "copy",
  title: "Kopieren",
  description:
    "Legt eine Kopie einer Datei an („… (Kopie).docx“), neben dem Original oder in „Meine Dateien“.",
  input: { id },
  writes: true,
  run: async ({ api, origin }, { id }) =>
    mapOutcome(await json(api(`/api/files/${id}/copy`, { method: "POST" }), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    ),
});

export const trash = defineTool({
  name: "trash",
  title: "In den Papierkorb",
  description:
    "Legt eine Datei oder einen Ordner mit allem darin in den Papierkorb; mit „restore“ kommt es zurück. Endgültig löschen gibt es hier nicht.",
  input: { id },
  writes: true,
  destructive: true,
  run: async ({ api }, { id }) =>
    mapOutcome(
      await json(api(`/api/nodes/${id}/trash`, { method: "POST" }), nodeSchema),
      (node) => `„${node.name}“ liegt im Papierkorb.`,
    ),
});

export const restore = defineTool({
  name: "restore",
  title: "Aus dem Papierkorb holen",
  description: "Holt eine Datei oder einen Ordner aus dem Papierkorb an den alten Ort zurück.",
  input: { id },
  writes: true,
  run: async ({ api, origin }, { id }) =>
    mapOutcome(await json(api(`/api/nodes/${id}/restore`, { method: "POST" }), nodeSchema), (node) =>
      asText(presentNode(origin, node)),
    ),
});

export const listVersions = defineTool({
  name: "list_versions",
  title: "Versionen",
  description: "Die gespeicherten Versionen einer Datei, die neueste zuerst.",
  input: { id },
  writes: false,
  run: async ({ api }, { id }) =>
    mapOutcome(await json(api(`/api/files/${id}/versions`), versionSchema.array()), (list) =>
      asText(list.map(presentVersion)),
    ),
});

export const restoreVersion = defineTool({
  name: "restore_version",
  title: "Version wiederherstellen",
  description:
    "Macht eine ältere Version wieder zur neuesten, als neue Version: Die Versionen dazwischen bleiben, das lässt sich also selbst wieder zurücknehmen.",
  input: { id, number: z.number().int().positive().describe("Die Nummer der Version") },
  writes: true,
  run: async ({ api, origin }, { id, number }) =>
    mapOutcome(
      await json(api(`/api/files/${id}/versions/${number}/restore`, { method: "POST" }), nodeSchema),
      (node) => asText(presentNode(origin, node)),
    ),
});

const roleText = (role: z.infer<typeof shareRoleSchema>) =>
  role === "edit" ? "zum Bearbeiten" : "zum Ansehen";
const DECLINED = "Du hast das abgelehnt; es wurde nichts freigegeben.";

/**
 * Asks the person, not the model, before something is opened to others: text the model read in a
 * document could ask it to share. The question names the node, as stored, and who gets what.
 * Only the owner may share, so for anyone else the API's refusal comes without a question.
 */
const confirmFirst = async (
  { api, confirm }: RunContext,
  id: string,
  question: (node: FileNode) => string,
): Promise<Outcome<FileNode>> => {
  const node = await json(api(`/api/nodes/${id}`), nodeSchema);
  if (!node.ok || node.value.role !== "owner") return node;
  return (await confirm(question(node.value))) === "declined" ? failure(DECLINED) : node;
};

const kindText = (node: FileNode) => (node.kind === "folder" ? "den Ordner" : "die Datei");

export const share = defineTool({
  name: "share",
  title: "Teilen",
  description:
    "Teilt eine Datei oder einen Ordner mit dem Konto hinter einer E-Mail-Adresse, zum Ansehen („view“) oder Bearbeiten („edit“). Nur der Besitzer darf das. Hat die Adresse noch kein Konto, wartet die Freigabe darauf („pending“), wo der Server das kennt.",
  input: {
    id,
    email: z.email().describe("Die E-Mail-Adresse des Kontos"),
    role: shareRoleSchema.describe("„view“ zum Ansehen, „edit“ zum Bearbeiten"),
  },
  writes: true,
  grantsAccess: true,
  run: async (context, { id, email, role }) => {
    const asked = await confirmFirst(
      context,
      id,
      (node) => `Schreibzeug: ${kindText(node)} „${node.name}“ mit ${email} teilen, ${roleText(role)}?`,
    );
    if (!asked.ok) return asked;
    return mapOutcome(
      await json(
        context.api(`/api/nodes/${id}/shares`, withJson("PUT", { email, role })),
        shareSchema.array(),
      ),
      (list) => asText({ sharedWith: list.map(presentShare) }),
    );
  },
});

export const createLink = defineTool({
  name: "create_link",
  title: "Link zum Teilen",
  description:
    "Erstellt einen Link, der eine Datei oder einen Ordner mit jedem teilt, der ihn öffnet und ein Konto hat oder anlegt; gültig 1, 7 oder 30 Tage.",
  input: {
    id,
    role: shareRoleSchema.describe("„view“ zum Ansehen, „edit“ zum Bearbeiten"),
    days: z
      .union([z.literal(1), z.literal(7), z.literal(30)])
      .default(7)
      .describe("Gültigkeit in Tagen"),
  },
  writes: true,
  grantsAccess: true,
  run: async (context, { id, role, days }) => {
    const asked = await confirmFirst(
      context,
      id,
      (node) =>
        `Schreibzeug: einen Link ${node.kind === "folder" ? "zum Ordner" : "zur Datei"} „${node.name}“ erstellen, ${days} ${days === 1 ? "Tag" : "Tage"} gültig? Jeder, der den Link öffnet, bekommt Zugriff ${roleText(role)}.`,
    );
    if (!asked.ok) return asked;
    return mapOutcome(
      await json(context.api(`/api/nodes/${id}/invites`, withJson("POST", { role, days })), inviteSchema),
      (invite) =>
        asText({
          link: `${context.origin}/invite/${invite.token}`,
          role: invite.role,
          expiresAt: invite.expiresAt,
        }),
    );
  },
});

export const FILE_TOOLS = [
  listFolder,
  searchFiles,
  getFile,
  createFolder,
  rename,
  move,
  copy,
  trash,
  restore,
  listVersions,
  restoreVersion,
  share,
  createLink,
] as const;
