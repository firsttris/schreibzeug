import { joinSession } from "@stapel/editor-core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { messageOf } from "./api/client";
import { useFiles } from "./api/context";
import type { OpenedFile } from "./files";

export type SessionFile =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; file: OpenedFile & { parentId: string | null } };

/**
 * Joins the file's editing session and loads the version it started from: everyone in a session
 * opens the same bytes and replays the same changes on top. Leaving the page leaves the session.
 * `generation` opens it anew, e.g. after a restored version.
 */
export const useSessionFile = (fileId: string, generation: number): SessionFile => {
  const { queries, commands, collabUrl } = useFiles();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionFile>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new generation opens the session again
  useEffect(() => {
    let cancelled = false;
    let close = () => {};
    setState({ status: "loading" });

    const open = async () => {
      const channel = await joinSession(collabUrl(fileId), { maxAttempts: 3 });
      close = channel.close;
      if (cancelled) return close();
      const [node, bytes] = await Promise.all([
        queryClient.fetchQuery(queries.node(fileId)),
        commands.content(fileId, channel.baseVersion),
      ]);
      if (cancelled) return close();
      setState({
        status: "ready",
        file: {
          name: node.name,
          parentId: node.parentId,
          bytes,
          collaboration: { channel, documentId: fileId },
        },
      });
    };
    open().catch((error: unknown) => {
      if (!cancelled) setState({ status: "error", message: messageOf(error) });
    });

    return () => {
      cancelled = true;
      close();
    };
  }, [fileId, generation]);

  return state;
};
