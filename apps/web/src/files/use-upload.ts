import { useQueryClient } from "@tanstack/react-query";
import { type DragEvent, useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";

export type UploadState = { running: number; failures: string[] };

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * Uploads into a folder, one file after the other, and collects what failed with the server's
 * reason. Also the drag-and-drop handlers for the area that accepts files.
 */
export const useUpload = (parentId: string | null) => {
  const { commands } = useFiles();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({ running: 0, failures: [] });
  const [dragging, setDragging] = useState(false);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setState({ running: files.length, failures: [] });
    for (const file of files) {
      try {
        await commands.upload(parentId, file);
      } catch (error) {
        setState((current) => ({
          ...current,
          failures: [...current.failures, `${file.name}: ${messageOf(error)}`],
        }));
      }
      setState((current) => ({ ...current, running: current.running - 1 }));
    }
    await refreshFiles(queryClient);
  };

  const dropZone = {
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      void upload([...event.dataTransfer.files]);
    },
  };

  const dismiss = () => setState((current) => ({ ...current, failures: [] }));

  return { upload, state, dragging, dropZone, dismiss };
};
