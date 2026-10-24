/**
 * Links in a text document, the way web-apps' link dialog makes them (documenteditor main
 * controller/Links.js onHyperlinkClick, view/HyperlinkSettingsDialog.js getSettings): when the
 * engine may add a link here (`can_AddHyperlink` answers the selected text) the dialog makes a new
 * one with `add_Hyperlink`; otherwise the cursor is in a link, which `change_Hyperlink` and
 * `remove_Hyperlink` (word/api.js) take as the engine's own Asc.CHyperlinkProperty.
 */

export type Link = { url: string; text: string };

/** Asc.CHyperlinkProperty (common/apiCommon.js), as far as used here. */
export type HyperlinkProps = {
  get_Value(): string | null;
  get_Text(): string | null;
  put_Value(url: string): void;
  /** null keeps the text as it is, with its formatting. */
  put_Text(text: string | null): void;
  put_Bookmark(name: string | null): void;
};

/** asc_CSelectedObject (common/apiCommon.js): one thing at the cursor and what it is. */
export type SelectedObject = { get_ObjectType(): number; get_ObjectValue(): unknown };

export type LinkApi = {
  /** The selected text when a link may be added here, false when not (in a link, for one). */
  can_AddHyperlink(): string | false | null;
  getSelectedElements(): SelectedObject[];
  add_Hyperlink(props: HyperlinkProps): void;
  change_Hyperlink(props: HyperlinkProps): void;
  remove_Hyperlink(props: HyperlinkProps): void;
};

/** A web address as web-apps completes it: "example.org" gets "http://", an e-mail "mailto:". */
export const completeUrl = (input: string): string => {
  const url = input.trim();
  if (/^((https?|ftp):\/\/|mailto:)/i.test(url)) return url;
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url) ? `mailto:${url}` : `http://${url}`;
};

/** What the link dialog shows, and what makes or changes the link with what was entered. */
export type LinkDraft = { link: Link; existing: boolean; apply: (link: Link) => void };

export type LinkCommands = {
  /** A new link for the selection, or the link at the cursor; null where neither is possible. */
  draft: () => LinkDraft | null;
  /** Takes the link at the cursor away and keeps its text. */
  remove: () => void;
};

/**
 * The address completed; the text only when it changed, so the linked text keeps its formatting,
 * and the address itself where there is no text at all.
 */
const fill = (props: HyperlinkProps, entered: Link, before: string): HyperlinkProps => {
  const url = completeUrl(entered.url);
  const text = entered.text.trim();
  props.put_Value(url);
  props.put_Bookmark(null);
  props.put_Text(!text ? (before ? null : url) : text === before ? null : text);
  return props;
};

export const readLink = (props: HyperlinkProps): Link => ({
  url: props.get_Value() ?? "",
  text: props.get_Text() ?? "",
});

export const createLinkCommands = (
  api: LinkApi,
  newProps: () => HyperlinkProps,
  hyperlinkType: number,
): LinkCommands => {
  const linkAtCursor = () =>
    (api
      .getSelectedElements()
      .find((element) => element.get_ObjectType() === hyperlinkType)
      ?.get_ObjectValue() as HyperlinkProps | undefined) ?? null;

  return {
    draft: () => {
      const selected = api.can_AddHyperlink();
      if (selected !== false) {
        // The selected text ends with the paragraph mark when a whole line is selected.
        const text = (selected ?? "").replace(/[\r\n]+$/, "");
        return {
          link: { url: "", text },
          existing: false,
          apply: (entered) => api.add_Hyperlink(fill(newProps(), entered, text)),
        };
      }
      const props = linkAtCursor();
      if (!props) return null;
      const link = readLink(props);
      return {
        link,
        existing: true,
        apply: (entered) => api.change_Hyperlink(fill(props, entered, link.text)),
      };
    },
    remove: () => {
      const props = linkAtCursor();
      if (props) api.remove_Hyperlink(props);
    },
  };
};
