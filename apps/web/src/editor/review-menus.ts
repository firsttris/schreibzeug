import type { ReviewCommands, ReviewDisplay, ReviewState } from "@schreibzeug/editor-core";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

/** The display modes in the words of Word. */
export const REVIEW_DISPLAYS: Record<ReviewDisplay, string> = {
  markup: "Mit Markierungen",
  final: "Endgültig",
  original: "Original",
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
    { label: "Annehmen und weiter", disabled, onSelect: run((c) => c.accept()) },
    { label: "Ablehnen und weiter", disabled, onSelect: run((c) => c.reject()) },
    { label: "Vorherige Änderung", disabled, onSelect: run((c) => c.previous()) },
    { label: "Nächste Änderung", disabled, onSelect: run((c) => c.next()) },
  ];
  return {
    label: "Überprüfen",
    groups: [
      ...(spelling.length > 0 ? [spelling] : []),
      [
        {
          label: "Änderungen nachverfolgen",
          checked: review.tracking,
          disabled,
          onSelect: run((c) => c.setTracking(!review.tracking)),
        },
      ],
      atChanges,
      [
        { label: "Alle Änderungen annehmen", disabled, onSelect: run((c) => c.acceptAll()) },
        { label: "Alle Änderungen ablehnen", danger: true, disabled, onSelect: run((c) => c.rejectAll()) },
      ],
      (Object.keys(REVIEW_DISPLAYS) as ReviewDisplay[]).map((display) => ({
        label: `Anzeige: ${REVIEW_DISPLAYS[display]}`,
        checked: review.display === display,
        disabled,
        onSelect: run((c) => c.setDisplay(display)),
      })),
    ],
  };
};
