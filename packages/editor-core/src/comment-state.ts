import { readComment } from "./comments";
import type { CellEventArgs, CommentEventArgs } from "./engine-types";
import type { Comment } from "./state";

/** The comments of a document and those at the cursor, in the text and the presentation editor. */
export type CommentsState = {
  /** In the order the engine reported them, which is their order in the file. */
  comments: Comment[];
  /** The comments on the text at the cursor, or on the slide's comment that is open. */
  activeComments: string[];
};

export type CommentEvent =
  | { type: "commentSet"; comment: Comment }
  | { type: "commentsSet"; comments: Comment[] }
  | { type: "commentsRemoved"; ids: string[] }
  | { type: "commentRemoved"; id: string }
  | { type: "activeComments"; ids: string[] };

export const initialCommentsState: CommentsState = { comments: [], activeComments: [] };

const COMMENT_EVENTS = new Set<string>([
  "commentSet",
  "commentsSet",
  "commentRemoved",
  "commentsRemoved",
  "activeComments",
]);

export const isCommentEvent = (event: { type: string }): event is CommentEvent =>
  COMMENT_EVENTS.has(event.type);

/** Replaces the comment with the same id in place, or adds it at the end. */
const setComment = (comments: Comment[], comment: Comment): Comment[] =>
  comments.some((existing) => existing.id === comment.id)
    ? comments.map((existing) => (existing.id === comment.id ? comment : existing))
    : [...comments, comment];

export const reduceComments = <S extends CommentsState>(state: S, event: CommentEvent): S => {
  switch (event.type) {
    case "commentSet":
      return { ...state, comments: setComment(state.comments, event.comment) };
    case "commentsSet":
      return { ...state, comments: event.comments.reduce(setComment, state.comments) };
    case "commentRemoved":
      return reduceComments(state, { type: "commentsRemoved", ids: [event.id] });
    case "commentsRemoved": {
      const gone = new Set(event.ids);
      return {
        ...state,
        comments: state.comments.filter((comment) => !gone.has(comment.id)),
        activeComments: state.activeComments.filter((id) => !gone.has(id)),
      };
    }
    case "activeComments":
      return { ...state, activeComments: event.ids };
  }
};

type CommentTranslators = {
  [N in keyof CommentEventArgs]: (...args: CommentEventArgs[N]) => CommentEvent;
};

/** The engines' comment events (sync_AddComment, sync_ChangeCommentData, … in word and slide api.js). */
export const commentEvents = (): CommentTranslators => ({
  asc_onAddComment: (id, data) => ({ type: "commentSet", comment: readComment(id, data) }),
  asc_onChangeCommentData: (id, data) => ({ type: "commentSet", comment: readComment(id, data) }),
  asc_onRemoveComment: (id) => ({ type: "commentRemoved", id }),
  asc_onShowComment: (ids) => ({ type: "activeComments", ids: [...ids] }),
  asc_onHideComment: () => ({ type: "activeComments", ids: [] }),
});

type CellCommentTranslators = {
  [N in "asc_onAddComments" | "asc_onChangeComments" | "asc_onRemoveComments"]: (
    ...args: CellEventArgs[N]
  ) => CommentEvent;
};

/**
 * The spreadsheet engine also reports comments in lists: a sheet's comments on open and when it is
 * shown, and those that moved or went with their cells (web-apps common/main Comments.js
 * onChangeComments, common/mobile Comments.jsx addComments, removeComments).
 */
export const cellCommentEvents = (): CellCommentTranslators => ({
  asc_onAddComments: (comments) => ({
    type: "commentsSet",
    comments: comments.map((data) => readComment(data.asc_getId(), data)),
  }),
  asc_onChangeComments: (changes) => ({
    type: "commentsSet",
    comments: changes.map(({ Id, Comment }) => readComment(Id, Comment)),
  }),
  asc_onRemoveComments: (ids) => ({ type: "commentsRemoved", ids: [...ids] }),
});

/** A sheet's comments: their ids start with "sheet<id>_" (cell/model/CellComment.js). */
export const isOnSheet = (comment: Comment, sheetId: string): boolean =>
  comment.id.startsWith(`sheet${sheetId}_`);
