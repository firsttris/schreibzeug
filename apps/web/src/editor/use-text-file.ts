import { type DecodedText, decodeText, sha256Hex } from "@schreibzeug/text-editor/codec";
import { useEffect, useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";

/** A text file as the text editor opens it: its text and form, and the version it was made from. */
export type TextFile = DecodedText & {
  /** The SHA-256 of the bytes opened; a save is made over it (files-api ifMatchOf). */
  sha256: string;
};

export type TextFileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; file: TextFile };

/**
 * Loads the newest version of a text file, without an editing session: the text editor saves the
 * whole file, made over the version it opened. `generation` loads it anew, e.g. after a conflict
 * or a restored version.
 */
export const useTextFile = (fileId: string, generation: number): TextFileState => {
  const { commands } = useFiles();
  const [state, setState] = useState<TextFileState>({ status: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new generation loads the file again
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const load = async () => {
      const bytes = await commands.content(fileId);
      const file = { ...decodeText(bytes), sha256: await sha256Hex(bytes) };
      if (!cancelled) setState({ status: "ready", file });
    };
    load().catch((error: unknown) => {
      if (!cancelled) setState({ status: "error", message: messageOf(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, generation]);

  return state;
};
