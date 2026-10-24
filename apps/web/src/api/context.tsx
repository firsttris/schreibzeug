import { type ServerInfo, serverInfoSchema } from "@schreibzeug/files-api";
import { createContext, type ReactNode, useContext } from "react";
import type { ApiClient } from "./client";
import { fileCommands, fileQueries } from "./files";

export type Files = {
  queries: ReturnType<typeof fileQueries>;
  commands: ReturnType<typeof fileCommands>;
  /** The WebSocket address of a file's editing session (apps/server src/collab/routes.ts). */
  collabUrl: (fileId: string) => string;
  /** Where an image added to a file while editing is served (apps/server src/files/routes.ts). */
  mediaUrl: (fileId: string, name: string) => string;
  /** A Schreibzeug server, or the desktop app's files on this computer (apps/local). */
  info: ServerInfo;
};

const FilesContext = createContext<Files | null>(null);

export const createFiles = (api: ApiClient, baseUrl: string, info: ServerInfo): Files => ({
  queries: fileQueries(api),
  commands: fileCommands(api),
  collabUrl: (fileId) => `${baseUrl.replace(/^http/, "ws")}/api/collab/${fileId}`,
  mediaUrl: (fileId, name) => `${baseUrl}/api/files/${fileId}/media/${name}`,
  info,
});

/**
 * Which kind of server this is (`/api/info`). A server from before that route answers 404: that
 * one is a Schreibzeug server, as is anything that does not answer as expected.
 */
export const fetchServerInfo = async (baseUrl: string): Promise<ServerInfo> => {
  const reply = await fetch(`${baseUrl}/api/info`).catch(() => null);
  const parsed = serverInfoSchema.safeParse(reply?.ok ? await reply.json().catch(() => null) : null);
  return parsed.success ? parsed.data : { mode: "server" };
};

/** What the user's own files are called: "Meine Dateien", or the folder's name on this computer. */
export const rootLabel = (info: ServerInfo): string =>
  info.mode === "local" ? info.rootName : "Meine Dateien";

/** Hands the server connection down; the desktop app will pass a client for another server. */
export const FilesProvider = ({ files, children }: { files: Files; children: ReactNode }) => (
  <FilesContext.Provider value={files}>{children}</FilesContext.Provider>
);

export const useFiles = (): Files => {
  const files = useContext(FilesContext);
  if (!files) throw new Error("useFiles needs a FilesProvider");
  return files;
};
