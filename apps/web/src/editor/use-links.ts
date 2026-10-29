import type { LinkCommands, LinkDraft } from "@schreibzeug/editor-core";
import { useEffect, useState } from "react";
import { m } from "../paraglide/messages";

type LinkSource = {
  links: LinkCommands;
  onLinkRequest: (listener: () => void) => () => void;
  onLinkOpen: (listener: (url: string) => void) => () => void;
};

/** Only addresses a browser opens as pages or mail; a document may carry anything else. */
const isOpenable = (url: string): boolean => /^(https?:\/\/|mailto:)/i.test(url);

/** Opens an address of a link in a new tab, without giving the page a handle on Schreibzeug. */
export const openLink = (url: string): void => {
  if (isOpenable(url)) window.open(url, "_blank", "noopener,noreferrer");
};

/**
 * The link dialog: from the menu, the toolbar or Strg+K in the document; and Strg+click on a link
 * opens its address. Someone who may only look can follow links but not make them.
 */
export const useLinks = (editor: LinkSource | null, readOnly: boolean, notify: (message: string) => void) => {
  const [draft, setDraft] = useState<LinkDraft | null>(null);

  const request = () => {
    if (!editor || readOnly) return;
    const next = editor.links.draft();
    if (next) setDraft(next);
    else notify(m.use_links_not_here());
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribes once per editor; request reads the latest editor
  useEffect(() => {
    if (!editor) return;
    const stopRequests = editor.onLinkRequest(request);
    const stopOpens = editor.onLinkOpen(openLink);
    return () => {
      stopRequests();
      stopOpens();
    };
  }, [editor, readOnly]);

  return { draft, request, close: () => setDraft(null) };
};
