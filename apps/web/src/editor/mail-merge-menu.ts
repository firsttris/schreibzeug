import type { Menu } from "../ui/menu-bar";

export type MailMergeMenuContext = {
  /** The editor offers a mail merge and a new file can be stored. */
  ready: boolean;
  hasRecipients: boolean;
  previewing: boolean;
  onChoose: () => void;
  onTogglePreview: () => void;
  onCreate: () => void;
};

/** "Serienbrief", after Word's "Sendungen": recipients, preview, the letters. */
export const mailMergeMenu = (context: MailMergeMenuContext, off: boolean): Menu => ({
  label: "Serienbrief",
  groups: [
    [{ label: "Empfänger wählen …", disabled: off || !context.ready, onSelect: context.onChoose }],
    [
      {
        label: "Vorschau",
        checked: context.previewing,
        disabled: off || !context.hasRecipients,
        onSelect: context.onTogglePreview,
      },
      { label: "Serienbrief erstellen", disabled: off || !context.hasRecipients, onSelect: context.onCreate },
    ],
  ],
});
