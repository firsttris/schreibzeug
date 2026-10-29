import { m } from "../paraglide/messages";
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
  label: m.mail_merge_menu_title(),
  groups: [
    [
      {
        label: m.mail_merge_menu_choose_recipients(),
        disabled: off || !context.ready,
        onSelect: context.onChoose,
      },
    ],
    [
      {
        label: m.mail_merge_menu_preview(),
        checked: context.previewing,
        disabled: off || !context.hasRecipients,
        onSelect: context.onTogglePreview,
      },
      {
        label: m.mail_merge_menu_create(),
        disabled: off || !context.hasRecipients,
        onSelect: context.onCreate,
      },
    ],
  ],
});
