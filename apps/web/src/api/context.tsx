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
};

const FilesContext = createContext<Files | null>(null);

export const createFiles = (api: ApiClient, baseUrl: string): Files => ({
  queries: fileQueries(api),
  commands: fileCommands(api),
  collabUrl: (fileId) => `${baseUrl.replace(/^http/, "ws")}/api/collab/${fileId}`,
  mediaUrl: (fileId, name) => `${baseUrl}/api/files/${fileId}/media/${name}`,
});

/** Hands the server connection down; the desktop app will pass a client for another server. */
export const FilesProvider = ({ files, children }: { files: Files; children: ReactNode }) => (
  <FilesContext.Provider value={files}>{children}</FilesContext.Provider>
);

export const useFiles = (): Files => {
  const files = useContext(FilesContext);
  if (!files) throw new Error("useFiles needs a FilesProvider");
  return files;
};
