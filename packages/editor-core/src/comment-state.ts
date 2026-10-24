import { readComment } from "./comments";
import type { CommentEventArgs } from "./engine-types";
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
  | { type: "commentRemoved"; id: string }
  | { type: "activeComments"; ids: string[] };

export const initialCommentsState: CommentsState = { comments: [], activeComments: [] };

const COMMENT_EVENTS = new Set<string>(["commentSet", "commentRemoved", "activeComments"]);

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
    case "commentRemoved":
      return {
        ...state,
        comments: state.comments.filter((comment) => comment.id !== event.id),
        activeComments: state.activeComments.filter((id) => id !== event.id),
      };
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
