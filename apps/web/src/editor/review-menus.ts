import type { ReviewCommands, ReviewDisplay, ReviewState } from "@schreibzeug/editor-core";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

/** The display modes in the words of Word. */
export const REVIEW_DISPLAYS: Record<ReviewDisplay, () => string> = {
  markup: m.review_menus_display_markup,
  final: m.review_menus_display_final,
  original: m.review_menus_display_original,
};

/**
 * "Überprüfen": tracking for the document, moving through the changes, accepting and rejecting
 * them, and how they show, as the review tab of web-apps (common/main view/ReviewChanges.js).
 */
export const reviewMenu = (
  review: ReviewState,
  commands: ReviewCommands | null,
  off: boolean,
  spelling: MenuItem[] = [],
): Menu => {
  const disabled = off || !commands;
  const run = (action: (c: ReviewCommands) => void) => () => commands && action(commands);
  const atChanges: MenuItem[] = [
    { label: m.review_menus_accept_next(), disabled, onSelect: run((c) => c.accept()) },
    { label: m.review_menus_reject_next(), disabled, onSelect: run((c) => c.reject()) },
    { label: m.review_menus_previous(), disabled, onSelect: run((c) => c.previous()) },
    { label: m.review_menus_next(), disabled, onSelect: run((c) => c.next()) },
  ];
  return {
    label: m.review_menus_title(),
    groups: [
      ...(spelling.length > 0 ? [spelling] : []),
      [
        {
          label: m.review_menus_track_changes(),
          checked: review.tracking,
          disabled,
          onSelect: run((c) => c.setTracking(!review.tracking)),
        },
      ],
      atChanges,
      [
        { label: m.review_menus_accept_all(), disabled, onSelect: run((c) => c.acceptAll()) },
        { label: m.review_menus_reject_all(), danger: true, disabled, onSelect: run((c) => c.rejectAll()) },
      ],
      (Object.keys(REVIEW_DISPLAYS) as ReviewDisplay[]).map((display) => ({
        label: m.review_menus_display({ mode: REVIEW_DISPLAYS[display]() }),
        checked: review.display === display,
        disabled,
        onSelect: run((c) => c.setDisplay(display)),
      })),
    ],
  };
};
