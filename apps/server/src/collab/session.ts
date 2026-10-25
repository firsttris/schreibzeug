/**
 * One editing session per file: the participants, the change log on top of the version the
 * session started from, and the locks. Pure functions take the session and a message from one
 * connection and return the new session and the messages to send; hub.ts and routes.ts only
 * deliver them.
 *
 * The messages are the ones sdkjs speaks with the Document Server (sdkjs common/docscoapi.js
 * `_onServerMessage`, server DocService/sources/DocsCoServer.js); docs/collaboration.md lists them.
 */
import { acquireLocks, EDITOR_TYPE, type Locks, locksForAuth, tryLocks } from "./locks";

export type Participant = {
  /** Our connection id; sdkjs sees it as the session id. */
  connectionId: string;
  /** sdkjs user id: the original id plus the index of this join (DocsCoServer `curUserId`). */
  id: string;
  idOriginal: string;
  username: string;
  indexUser: number;
  view: boolean;
};

/** One change as DocsCoServer stores and sends it. */
export type StoredChange = {
  docid: string;
  change: string;
  time: number;
  user: string;
  useridoriginal: string;
};

export type Session = {
  fileId: string;
  /** The file version every participant opens; the changes apply on top of it. */
  baseVersion: number;
  changes: StoredChange[];
  locks: Locks;
  /** Which editor the session's document is in (locks.ts EDITOR_TYPE), from the first `auth`. */
  editorType: number;
  participants: Participant[];
  nextIndexUser: number;
  /** How many changes of the log a stored version holds: the rest exists only in this session. */
  savedIndex: number;
};

export type Recipient = { to: "self" } | { to: "others" } | { to: "all" };
export type Outgoing = Recipient & { message: Record<string, unknown> };
export type Step = { session: Session; out: Outgoing[] };

/** What a connection sent: sdkjs messages are objects with a `type`. */
export type Incoming = { type: string; [key: string]: unknown };

export const createSession = (fileId: string, baseVersion: number): Session => ({
  fileId,
  baseVersion,
  changes: [],
  locks: {},
  editorType: EDITOR_TYPE.document,
  participants: [],
  nextIndexUser: 1,
  savedIndex: 0,
});

/** Our message telling everyone how much of the log is stored in a version. */
const savedMessage = (session: Session) => ({ type: "schreibzeug:saved", index: session.savedIndex });

/**
 * A client stored the document as a new version, holding the first `index` changes of the log
 * (`schreibzeug:saved`, sent after its upload). The newest save wins; nothing moves backwards.
 */
export const markSaved = (session: Session, data: Incoming): Step => {
  const index = typeof data.index === "number" && Number.isInteger(data.index) ? data.index : -1;
  if (index < 0) return { session, out: [] };
  const next = {
    ...session,
    savedIndex: Math.max(session.savedIndex, Math.min(index, session.changes.length)),
  };
  return { session: next, out: [{ to: "all", message: savedMessage(next) }] };
};

const self = (message: Record<string, unknown>): Outgoing => ({ to: "self", message });
const others = (message: Record<string, unknown>): Outgoing => ({ to: "others", message });

/** Version and license the client checks; values as CryptPad's mock server sends them. */
const BUILD = { buildVersion: "9.3.4", buildNumber: 1 };

/**
 * The license sdkjs waits for after connecting (DocsCoServer sends it on connect). Type 3 is a
 * valid license, rights 1 editing (common/commonDefines.js c_oLicenseResult, c_oRights).
 */
export const licenseMessage = (): Record<string, unknown> => ({
  type: "license",
  license: { type: 3, mode: 0, rights: 1, light: false, ...BUILD },
});

const participantOf = (session: Session, connectionId: string) =>
  session.participants.find((participant) => participant.connectionId === connectionId);

const connectState = (session: Session, now: number): Record<string, unknown> => ({
  type: "connectState",
  participantsTimestamp: now,
  participants: session.participants,
  waitAuth: false,
});

type AuthUser = { id?: unknown; username?: unknown; indexUser?: unknown };

/** The user as sdkjs announces it in `auth` (docscoapi.js getAuthCommand: user.asc_getId(), …). */
const readUser = (data: Incoming): { idOriginal: string; username: string } => {
  const user = (data.user ?? {}) as AuthUser;
  return {
    idOriginal: typeof user.id === "string" && user.id ? user.id : "anonymous",
    username: typeof user.username === "string" && user.username ? user.username : "Unbekannt",
  };
};

const isViewer = (data: Incoming): boolean => data.mode === "view";

/** DocsCoServer's code for a session that cannot be restored (Common/sources/constants.js RESTORE_CODE). */
export const RESTORE_CODE = 4004;

/**
 * A client that lost its connection comes back with its old session id. That works only if
 * nobody else changed the document meanwhile: the last change by someone else must be the one the
 * client last saw (`lastOtherSaveTime`, compared in whole seconds like DocsCoServer), and the
 * blocks it held may be taken again. Then it keeps its user id and its locks; otherwise it gets an
 * error and has to open the document again (DocsCoServer.js auth, "Restore error. …").
 */
const restore = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  const { idOriginal, username } = readUser(data);
  const user = (data.user ?? {}) as AuthUser;
  const indexUser = typeof user.indexUser === "number" ? user.indexUser : session.nextIndexUser;
  const id = `${idOriginal}${indexUser}`;
  const lastOther = [...session.changes].reverse().find((change) => change.user !== id);
  const seen = typeof data.lastOtherSaveTime === "number" ? data.lastOtherSaveTime : 0;
  if (lastOther && Math.trunc((seen - lastOther.time) / 1000) !== 0) {
    return {
      session,
      out: [self({ type: "error", description: "Restore error. Document modified.", code: RESTORE_CODE })],
    };
  }
  const participant: Participant = {
    connectionId,
    id,
    idOriginal,
    username,
    indexUser,
    view: isViewer(data),
  };
  // The blocks it held go through the same check as a getLock (DocsCoServer getLock with
  // bIsRestore): someone else's lock stays theirs, and a refused one ends the restore.
  const blocks = Array.isArray(data.block) ? data.block : [];
  const locks = blocks.length ? tryLocks(session.locks, blocks, id, now, session.editorType) : session.locks;
  if (!locks) {
    return {
      session,
      out: [self({ type: "error", description: "Restore error. Locks not checked.", code: RESTORE_CODE })],
    };
  }
  const next: Session = {
    ...session,
    nextIndexUser: Math.max(session.nextIndexUser, indexUser + 1),
    locks,
    participants: [...session.participants.filter((p) => p.id !== id), participant],
  };
  return {
    session: next,
    out: [
      self({
        type: "auth",
        result: 1,
        sessionId: connectionId,
        participants: next.participants,
        locks: locksForAuth(next.locks, next.editorType),
        indexUser,
        licenseType: 3,
        ...BUILD,
      }),
      others(connectState(next, now)),
      ...(blocks.length ? [others({ type: "getLock", locks: next.locks })] : []),
      self(savedMessage(next)),
    ],
  };
};

/**
 * A connection authenticates: it becomes a participant and gets everything it needs to catch up,
 * in DocsCoServer's order: the changes so far (`authChanges`), the session (`auth`), and the file
 * to open (`documentOpen`), whose URL is the one the client put in its own open command, so each
 * client opens the base version it converted itself.
 */
export const authenticate = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  if (typeof data.sessionId === "string" && data.sessionId) return restore(session, connectionId, data, now);
  const { idOriginal, username } = readUser(data);
  const indexUser = session.nextIndexUser;
  const participant: Participant = {
    connectionId,
    id: `${idOriginal}${indexUser}`,
    idOriginal,
    username,
    indexUser,
    view: isViewer(data),
  };
  const next: Session = {
    ...session,
    nextIndexUser: indexUser + 1,
    participants: [...session.participants.filter((p) => p.connectionId !== connectionId), participant],
    // DocsCoServer keeps the editor type per connection; one file is always in one editor.
    editorType: typeof data.editorType === "number" ? data.editorType : session.editorType,
  };
  const openCmd = data.openCmd as { url?: unknown } | undefined;
  const out: Outgoing[] = [
    self({ type: "authChanges", changes: session.changes }),
    self({
      type: "auth",
      result: 1,
      sessionId: connectionId,
      sessionTimeConnect: now,
      participants: next.participants,
      locks: locksForAuth(session.locks, next.editorType),
      indexUser,
      licenseType: 3,
      ...BUILD,
    }),
    others(connectState(next, now)),
    self(savedMessage(next)),
  ];
  if (openCmd && typeof openCmd.url === "string") {
    out.splice(
      2,
      0,
      self({
        type: "documentOpen",
        data: { type: "open", status: "ok", data: { "Editor.bin": openCmd.url } },
      }),
    );
  }
  return { session: next, out };
};

/** Blocks a client asks to edit; whether it gets them depends on the editor (locks.ts). */
export const getLock = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  const participant = participantOf(session, connectionId);
  if (!participant) return { session, out: [] };
  const blocks = Array.isArray(data.block) ? data.block : [];
  const locks = acquireLocks(session.locks, blocks, participant.id, now, session.editorType);
  return { session: { ...session, locks }, out: [{ to: "all", message: { type: "getLock", locks } }] };
};

const releaseLocksOf = (session: Session, userId: string, now: number) => {
  const released = Object.values(session.locks)
    .filter((lock) => lock.user === userId)
    .map((lock) => ({ block: lock.block, user: lock.user, time: now, changes: null }));
  const locks = Object.fromEntries(Object.entries(session.locks).filter(([, lock]) => lock.user !== userId));
  return { locks, released };
};

const parseChanges = (changes: unknown): unknown[] => {
  if (Array.isArray(changes)) return changes;
  if (typeof changes !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(changes);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Changes from one client go to the end of the log and to everyone else (DocsCoServer
 * `saveChanges`). A save may come in parts; only the last (`endSaveChanges`) releases locks and
 * answers with `unSaveLock`, which tells the client its changes have their place in the log.
 */
export const saveChanges = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  const participant = participantOf(session, connectionId);
  if (!participant) return { session, out: [] };

  // A client resending after a reconnect drops what it sent before from `deleteIndex` on.
  const deleteIndex = data.startSaveChanges && typeof data.deleteIndex === "number" ? data.deleteIndex : -1;
  const kept =
    deleteIndex >= 0 && deleteIndex < session.changes.length
      ? session.changes.slice(0, deleteIndex)
      : session.changes;
  const startIndex = kept.length;
  const added: StoredChange[] = parseChanges(data.changes).map((change) => ({
    docid: session.fileId,
    change: JSON.stringify(change),
    time: now,
    user: participant.id,
    useridoriginal: participant.idOriginal,
  }));
  const changes = [...kept, ...added];
  // Changes sent again replace the old ones; a save holding the old ones no longer counts for them.
  const savedIndex = Math.min(session.savedIndex, kept.length);
  const changesIndex = deleteIndex === -1 && data.startSaveChanges ? startIndex : -1;

  if (!data.endSaveChanges) {
    return {
      session: { ...session, changes, savedIndex },
      out: [
        others({
          type: "saveChanges",
          changes: added,
          changesIndex: changes.length,
          syncChangesIndex: changes.length,
          endSaveChanges: false,
          locks: [],
        }),
        self({ type: "savePartChanges", changesIndex, syncChangesIndex: changes.length }),
      ],
    };
  }

  const { locks, released } = data.releaseLocks
    ? releaseLocksOf(session, participant.id, now)
    : { locks: session.locks, released: [] };
  return {
    session: { ...session, changes, locks, savedIndex },
    out: [
      others({
        type: "saveChanges",
        changes: added,
        changesIndex: changes.length,
        syncChangesIndex: changes.length,
        endSaveChanges: true,
        locks: released,
        // Spreadsheets send how rows and columns moved, for the others to follow (DocsCoServer saveChanges).
        excelAdditionalInfo: data.excelAdditionalInfo,
      }),
      self({ type: "unSaveLock", index: changesIndex, time: now, syncChangesIndex: changes.length }),
    ],
  };
};

/** The client leaves the document's locks (DocsCoServer `unLockDocument`). */
/** The answer to a save that ended without changes: the client may send again (DocsCoServer unSaveLock). */
const SAVE_UNLOCKED = { type: "unSaveLock", index: -1, time: -1, syncChangesIndex: -1 };

/**
 * The client is done with a step: it may drop changes from `deleteIndex` on (sent again after a
 * reconnect), give back its locks, and end a save that had nothing to send, which it waits for
 * before sending anything else (DocsCoServer checkEndAuthLock).
 */
export const unlockDocument = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  const participant = participantOf(session, connectionId);
  if (!participant) return { session, out: [] };
  const deleteIndex = typeof data.deleteIndex === "number" ? data.deleteIndex : -1;
  const changes =
    deleteIndex >= 0 && deleteIndex < session.changes.length
      ? session.changes.slice(0, deleteIndex)
      : session.changes;
  const { locks, released } = data.releaseLocks
    ? releaseLocksOf(session, participant.id, now)
    : { locks: session.locks, released: [] };
  const out: Outgoing[] = [];
  if (released.length) {
    out.push(
      self({ type: "releaseLock", locks: released }),
      others({ type: "releaseLock", locks: released }),
    );
  }
  if (data.isSave) out.push(self(SAVE_UNLOCKED));
  return {
    session: { ...session, changes, locks, savedIndex: Math.min(session.savedIndex, changes.length) },
    out,
  };
};

/** Where someone's cursor is, for everyone else (DocsCoServer `sendDataCursor`). */
export const cursor = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  const participant = participantOf(session, connectionId);
  if (!participant) return { session, out: [] };
  return {
    session,
    out: [
      others({
        type: "cursor",
        messages: [
          { cursor: data.cursor, time: now, user: participant.id, useridoriginal: participant.idOriginal },
        ],
      }),
    ],
  };
};

/** A connection is gone: its locks are freed and the others see it leave. */
export const disconnect = (session: Session, connectionId: string, now: number): Step => {
  const participant = participantOf(session, connectionId);
  if (!participant) return { session, out: [] };
  const { locks, released } = releaseLocksOf(session, participant.id, now);
  const next = {
    ...session,
    locks,
    participants: session.participants.filter((p) => p.connectionId !== connectionId),
  };
  const out: Outgoing[] = [others(connectState(next, now))];
  if (released.length) out.unshift(others({ type: "releaseLock", locks: released }));
  return { session: next, out };
};

const MEDIA_PREFIX = "media/";

/**
 * Where an engine loads an image that reached it by name inside someone's change
 * (common/CollaborativeEditingBase.js SendImagesUrlsFromChanges: an rpc of type "pathurls" with
 * "media/<name>" paths). The Document Server answers with signed storage URLs
 * (DocsCoServer.js startRPC, canvasservice.js commandPathUrls); here the image route of the file
 * serves them (apps/server src/files/routes.ts), relative to the engine's own origin.
 */
export const answerRpc = (session: Session, data: Incoming): Step => {
  const request = data.data as { type?: unknown; data?: unknown } | undefined;
  if (request?.type !== "pathurls" || !Array.isArray(request.data)) return { session, out: [] };
  const urls = request.data.map((path) =>
    typeof path === "string" && path.startsWith(MEDIA_PREFIX)
      ? `/api/files/${session.fileId}/media/${encodeURIComponent(path.slice(MEDIA_PREFIX.length))}`
      : "",
  );
  const answer = { type: "pathurls", status: "ok", data: urls };
  return { session, out: [self({ type: "rpc", responseKey: data.responseKey, data: answer })] };
};

/** Every message from a client, by type; types the relay does not need are ignored. */
export const receive = (session: Session, connectionId: string, data: Incoming, now: number): Step => {
  switch (data.type) {
    case "auth":
      return authenticate(session, connectionId, data, now);
    case "getLock":
      return getLock(session, connectionId, data, now);
    case "saveChanges":
      return saveChanges(session, connectionId, data, now);
    case "unLockDocument":
      return unlockDocument(session, connectionId, data, now);
    case "cursor":
      return cursor(session, connectionId, data, now);
    case "isSaveLock":
      // One relay process orders all saves, so nobody has to wait for another's save.
      return { session, out: [self({ type: "saveLock", saveLock: false })] };
    case "unSaveLock":
      // A client giving up a save without changes; -1 everywhere, as DocsCoServer answers.
      return { session, out: [self(SAVE_UNLOCKED)] };
    case "schreibzeug:saved":
      return markSaved(session, data);
    case "rpc":
      return answerRpc(session, data);
    case "getMessages":
      return { session, out: [self({ type: "message" })] };
    default:
      // authChangesAck, clientLog, extendSession, close …: nothing to answer.
      return { session, out: [] };
  }
};
