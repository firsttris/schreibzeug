import { createContext, type ReactNode, useContext } from "react";
import type { ApiClient } from "./client";
import { fileCommands, fileQueries } from "./files";

export type Files = { queries: ReturnType<typeof fileQueries>; commands: ReturnType<typeof fileCommands> };

const FilesContext = createContext<Files | null>(null);

export const createFiles = (api: ApiClient): Files => ({
  queries: fileQueries(api),
  commands: fileCommands(api),
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
