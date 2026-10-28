import { copyName, type FileNode } from "@schreibzeug/files-api";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { isApiFailure } from "../api/client";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { kindOf } from "../lib/format";
import { m } from "../paraglide/messages";
import { Failure, Loading } from "./page-states";
import { TextView } from "./text-view";
import { useEditorPage } from "./use-editor-page";
import { useTextFile } from "./use-text-file";

const MAX_COPY_ATTEMPTS = 20;

/**
 * A Markdown or plain text file from the server. It has no editing session: the text editor saves
 * the whole file, each save made over the version before it, and a save over a version someone
 * else replaced meanwhile asks what to do (use-text-save.ts).
 */
export const TextPage = ({ fileId, node }: { fileId: string; node: FileNode }) => {
  const { commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [generation, setGeneration] = useState(0);
  const reload = () => setGeneration((current) => current + 1);
  const opened = useTextFile(fileId, generation);
  const page = useEditorPage({
    name: node.name,
    node,
    parentId: node.parentId,
    owned: node.role === "owner",
    onRestored: reload,
  });
  const store = useCallback(
    async (bytes: Uint8Array, over: string) => {
      await commands.saveOver(fileId, bytes, over);
      await refreshFiles(queryClient);
    },
    [commands, fileId, queryClient],
  );

  /** "Notiz (Kopie).md", or the next name that is free, opened in place of this file. */
  const saveCopy = async (bytes: Uint8Array) => {
    const type = kindOf(node) === "md" ? "text/markdown" : "text/plain";
    for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
      const created = await page
        .createFile(copyName(node.name, attempt), bytes, type)
        .catch((error: unknown) => {
          if (isApiFailure(error) && error.error.kind === "name_taken") return null;
          throw error;
        });
      if (created) return void (await navigate({ to: "/edit/$fileId", params: { fileId: created.id } }));
    }
    throw new Error(m.text_page_no_copy_name());
  };

  if (opened.status === "loading") return <Loading />;
  if (opened.status === "error") return <Failure message={opened.message} />;
  return (
    <>
      <TextView
        // A reloaded or restored version is a new text: the editor starts over with it.
        key={`${fileId}:${generation}`}
        file={opened.file}
        name={node.name}
        markdown={kindOf(node) === "md"}
        readOnly={node.role === "view"}
        onStore={store}
        fileActions={page.actions}
        onRename={page.onRename}
        onReload={reload}
        onSaveCopy={saveCopy}
      />
      {page.dialogs}
    </>
  );
};
