import type { CommentApi, EngineCommentData } from "./engine-types";
import type { Comment, CommentEntry } from "./state";

/**
 * Comments as data, and the commands on them. The engines keep a comment as asc_CCommentDataWord
 * (word/api.js) or asc_CCommentDataSlide (slide/api.js, the same fields) with two times: `Time`, local time written as if it were UTC, and `OOTime`, real
 * milliseconds since 1970. Reading and writing follows web-apps
 * (common/mobile/lib/controller/collaboration/Comments.jsx readSDKComment, onChangeComment).
 */

/** Minutes behind UTC (Date#getTimezoneOffset) in milliseconds: what turns `Time` into real time. */
export const timezoneOffsetMs = (date = new Date()): number => date.getTimezoneOffset() * 60_000;

const readTime = (data: EngineCommentData, offsetMs: number): number => {
  const ooTime = data.asc_getOnlyOfficeTime();
  if (ooTime) return Number.parseInt(ooTime, 10);
  const time = data.asc_getTime();
  return time ? Number.parseInt(time, 10) + offsetMs : 0;
};

const readEntry = (data: EngineCommentData, offsetMs: number): CommentEntry => ({
  authorId: data.asc_getUserId(),
  author: data.asc_getUserName(),
  text: data.asc_getText(),
  time: readTime(data, offsetMs),
});

export const readComment = (id: string, data: EngineCommentData, offsetMs = timezoneOffsetMs()): Comment => ({
  id,
  ...readEntry(data, offsetMs),
  quote: data.asc_getQuoteText() || null,
  resolved: data.asc_getSolved(),
  guid: data.asc_getGuid(),
  replies: Array.from({ length: data.asc_getRepliesCount() }, (_, index) =>
    readEntry(data.asc_getReply(index), offsetMs),
  ),
});

export type CommentDataFactory = () => EngineCommentData;

const writeEntry = (data: EngineCommentData, entry: CommentEntry, offsetMs: number): EngineCommentData => {
  data.asc_putText(entry.text);
  data.asc_putTime(String(entry.time - offsetMs));
  data.asc_putOnlyOfficeTime(String(entry.time));
  data.asc_putUserId(entry.authorId);
  data.asc_putUserName(entry.author);
  return data;
};

/**
 * A whole comment as the engine takes it. asc_changeComment replaces the comment, so every change
 * (a reply, resolving) sends all of it again, replies included.
 */
export const writeComment = (
  create: CommentDataFactory,
  comment: Omit<Comment, "id">,
  offsetMs = timezoneOffsetMs(),
): EngineCommentData => {
  const data = writeEntry(create(), comment, offsetMs);
  if (comment.quote !== null) data.asc_putQuoteText(comment.quote);
  data.asc_putSolved(comment.resolved);
  if (comment.guid) data.asc_putGuid(comment.guid);
  for (const reply of comment.replies) data.asc_addReply(writeEntry(create(), reply, offsetMs));
  return data;
};

export type CommentAuthor = { id: string; name: string };

export type CommentCommands = {
  /** A comment on the selection (or at the cursor); returns its id, or null when the engine refused. */
  add: (text: string) => string | null;
  reply: (id: string, text: string) => void;
  setResolved: (id: string, resolved: boolean) => void;
  remove: (id: string) => void;
  /** Moves the selection to the commented text. */
  select: (id: string) => void;
};

export const createCommentCommands = (
  api: CommentApi,
  getComments: () => Comment[],
  author: CommentAuthor,
  create: CommentDataFactory,
  now: () => number = Date.now,
): CommentCommands => {
  const entry = (text: string): CommentEntry => ({
    authorId: author.id,
    author: author.name,
    text: text.trim(),
    time: now(),
  });
  const change = (id: string, update: (comment: Comment) => Comment) => {
    const comment = getComments().find((candidate) => candidate.id === id);
    if (comment) api.asc_changeComment(id, writeComment(create, update(comment)));
  };

  return {
    add: (text) =>
      api.asc_addComment(
        writeComment(create, { ...entry(text), quote: null, resolved: false, guid: "", replies: [] }),
      ),
    reply: (id, text) =>
      change(id, (comment) => ({ ...comment, replies: [...comment.replies, entry(text)] })),
    setResolved: (id, resolved) => change(id, (comment) => ({ ...comment, resolved })),
    remove: (id) => api.asc_removeComment(id),
    select: (id) => api.asc_selectComment(id),
  };
};
