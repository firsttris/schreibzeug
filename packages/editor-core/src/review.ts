/**
 * Tracked changes in the text editor, as web-apps' review drives them: switching tracking for the
 * whole document (common/main controller/ReviewChanges.js onTurnPreview with "global": stored in the
 * file as w:trackRevisions), the display modes, moving through the changes and accepting or
 * rejecting them (common/mobile controller/collaboration/Review.jsx), and the change at the cursor
 * the engine reports for its balloon (ReviewChanges.js onApiShowChange).
 */
import type { EngineRevision, WordEngineApi } from "./engine-types";

/** How the document shows its changes: marked, as if accepted, or as if rejected. */
export type ReviewDisplay = "markup" | "final" | "original";

export type RevisionKind = "insert" | "delete" | "paragraphInsert" | "paragraphDelete" | "format" | "other";

/** A tracked change at the cursor, for the balloon next to it. */
export type Revision = {
  author: string;
  /** Milliseconds since 1970; null where the file has no date. */
  time: number | null;
  kind: RevisionKind;
  /** The inserted or deleted text, if it is text. */
  text: string;
  /** Where it is, relative to the engine's view element (word/api.js sync_UpdateRevisionsChangesPosition). */
  x: number;
  y: number;
};

export type ReviewState = {
  /** New edits are tracked. */
  tracking: boolean;
  display: ReviewDisplay;
  /** The changes at the cursor; empty when there are none or the selection spans text. */
  atCursor: Revision[];
};

export const initialReviewState: ReviewState = { tracking: false, display: "markup", atCursor: [] };

/** common/commonDefines.js c_oAscRevisionsChangeType */
export type RevisionTypes = {
  TextAdd: number;
  TextRem: number;
  ParaAdd: number;
  ParaRem: number;
  TextPr: number;
  ParaPr: number;
};

const kindOf = (type: number, types: RevisionTypes): RevisionKind => {
  switch (type) {
    case types.TextAdd:
      return "insert";
    case types.TextRem:
      return "delete";
    case types.ParaAdd:
      return "paragraphInsert";
    case types.ParaRem:
      return "paragraphDelete";
    case types.TextPr:
    case types.ParaPr:
      return "format";
    default:
      return "other";
  }
};

/**
 * Inserted or deleted text comes as a string, or as a list of strings and drawings (Review.jsx
 * getArrChangeReview); drawings are left out of the text.
 */
const textOf = (value: unknown): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.filter((part): part is string => typeof part === "string").join("")
      : "";

/** word/Editor/RevisionsChange.js CRevisionsChange, as the balloon shows it. */
export const readRevision = (change: EngineRevision, types: RevisionTypes): Revision => {
  const date = change.get_DateTime();
  const time = date === "" || date === null || date === undefined ? null : new Date(date).getTime();
  return {
    author: change.get_UserName(),
    time: Number.isFinite(time) ? time : null,
    kind: kindOf(change.get_Type(), types),
    text: textOf(change.get_Value()),
    x: change.get_X(),
    y: change.get_Y(),
  };
};

/**
 * Whether new edits are tracked, from asc_onOnTrackRevisionsChange(local, global): a local flag of
 * null means the document's own setting holds (ReviewChanges.js onApiTrackRevisionsChange).
 */
export const trackingOf = (local: boolean | null, global: boolean): boolean =>
  local === null ? Boolean(global) : Boolean(local);

export type ReviewCommands = {
  setTracking: (on: boolean) => void;
  setDisplay: (display: ReviewDisplay) => void;
  next: () => void;
  previous: () => void;
  /** Accepts or rejects the change at the cursor (or in the selection) and moves to the next one. */
  accept: () => void;
  reject: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
};

/** common/commonDefines.js c_oAscDisplayModeInReview */
export type DisplayModes = { Edit: number; Final: number; Original: number };

export const createReviewCommands = (
  api: WordEngineApi,
  modes: DisplayModes,
  reportDisplay: (display: ReviewDisplay) => void,
): ReviewCommands => ({
  setTracking: (on) => {
    // For everyone, in the file: no own setting of this user on top (onTurnPreview, global).
    api.asc_SetLocalTrackRevisions(null);
    api.asc_SetGlobalTrackRevisions(on);
  },
  setDisplay: (display) => {
    api.asc_SetDisplayModeInReview(
      display === "final" ? modes.Final : display === "original" ? modes.Original : modes.Edit,
    );
    reportDisplay(display);
  },
  next: () => api.asc_GetNextRevisionsChange(),
  previous: () => api.asc_GetPrevRevisionsChange(),
  accept: () => api.asc_AcceptChangesBySelection(true),
  reject: () => api.asc_RejectChangesBySelection(true),
  acceptAll: () => api.asc_AcceptAllChanges(),
  rejectAll: () => api.asc_RejectAllChanges(),
});
