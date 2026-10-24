import type {
  AppShortcut,
  ContextMenuArea,
  ContextMenuListener,
  ContextMenuRequest,
} from "@stapel/editor-core";
import { type RefObject, useEffect, useState } from "react";
import { useNotice } from "../ui/use-notice";
import { useInsertImage } from "./use-insert-image";
import { usePdf } from "./use-pdf";
import { useSearchBar } from "./use-search-bar";
import { useShortcuts } from "./use-shortcuts";

/** What an open editor offers that the parts around it use. */
export type ChromeSource = {
  exportPdf: (() => Promise<Uint8Array>) | null;
  onShortcut: (listener: (shortcut: AppShortcut) => void) => () => void;
  onContextMenu: (listener: ContextMenuListener) => () => void;
  insertImage: ((bytes: Uint8Array) => Promise<void>) | null;
};

/** Where the engine's frame sits in the window: context menu points come in frame coordinates. */
const toWindow = (container: HTMLElement | null, request: ContextMenuRequest) => {
  const frame = container?.querySelector("iframe")?.getBoundingClientRect();
  return { x: (frame?.left ?? 0) + request.x, y: (frame?.top ?? 0) + request.y, area: request.area };
};

/**
 * The parts every editor has around its document: short messages, the search bar, PDF and print,
 * inserting an image, the keys Strg+F/H/P, and where a right click asks for the context menu. Someone who may only
 * look gets no context menu and cannot replace.
 */
export const useEditorChrome = (
  editor: ChromeSource | null,
  container: RefObject<HTMLDivElement | null>,
  name: string,
  readOnly: boolean,
) => {
  const [notice, notify] = useNotice();
  const searchBar = useSearchBar(!readOnly);
  const pdf = usePdf(editor, name, notify);
  const insertImage = useInsertImage(editor, readOnly, notify);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; area: ContextMenuArea } | null>(null);

  useShortcuts(editor, {
    find: () => searchBar.open("find"),
    replace: () => searchBar.open("replace"),
    ...(pdf ? { print: pdf.print } : {}),
  });

  useEffect(() => {
    if (!editor || readOnly) return;
    return editor.onContextMenu((request) => setMenuAt(toWindow(container.current, request)));
  }, [editor, readOnly, container]);

  return { notice, notify, searchBar, pdf, insertImage, menuAt, closeMenu: () => setMenuAt(null) };
};
