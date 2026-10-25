import { randomUUID } from "node:crypto";
import type { SessionSave } from "@schreibzeug/files-api";
import {
  createSession,
  disconnect,
  hasUnsavedChanges,
  type Incoming,
  licenseMessage,
  markSaved,
  type Outgoing,
  receive,
  type Session,
} from "./session";

/** Sends one message to one connection. */
export type Send = (message: Record<string, unknown>) => void;

/** Who is connected, as the server knows them from the session. */
export type HubUser = { id: string; name: string };

/** What the user may do with a file: its newest version, and whether they may change it. */
export type FileAccess = { version: number; role: "owner" | "edit" | "view" };

export type HubDeps = {
  /**
   * The file outside the trash as the user may use it, or null when they may not open it: every
   * connection is checked, also to a session that is already open.
   */
  access: (fileId: string, userId: string) => Promise<FileAccess | null>;
  now?: () => number;
};

type Connection = { fileId: string; user: HubUser; viewer: boolean; send: Send };

/**
 * sdkjs announces its user in `auth` (docscoapi.js getAuthCommand). The relay replaces id and name
 * with the signed-in user's, so nobody can edit under someone else's name, and sets the mode from
 * the user's role, so someone who may only look joins as a viewer whatever the client says.
 */
const withUser = (data: Incoming, connection: Connection): Incoming =>
  data.type === "auth"
    ? {
        ...data,
        user: {
          ...(data.user as object | undefined),
          id: connection.user.id,
          username: connection.user.name,
        },
        ...(connection.viewer ? { mode: "view" } : {}),
      }
    : data;

/**
 * What a viewer may not send. DocsCoServer refuses getLock, saveChanges and isSaveLock from a
 * viewer and drops the connection (DocsCoServer.js, "access deny"); a viewer's engine sends none of
 * them, so the relay just ignores them, with the messages that would end a save or mark one.
 */
const CHANGING = new Set(["getLock", "saveChanges", "isSaveLock", "unSaveLock", "unLockDocument"]);

/** How many session ids of an ended session stay valid for a restore: the latest connections. */
const ENDED_IDS_KEPT = 50;

/**
 * Holds the sessions of all open files and delivers what session.ts decides. A session starts
 * with the first connection to a file, at the file's newest version, and ends with the last one,
 * unless its log holds changes no stored version has: then it waits for the next connection, which
 * opens the same version, replays them and saves them (or, after a lost connection, restores),
 * unless a newer version was stored meanwhile.
 * Messages are handled one at a time per process, which keeps the order of the change log.
 */
export const createHub = ({ access, now = Date.now }: HubDeps) => {
  const sessions = new Map<string, Session>();
  const connections = new Map<string, Connection>();
  /**
   * The newest version an open session knows holds its document: the one it started at, or one its
   * own clients stored (`stored`, told by the save). Another version is from outside.
   */
  const storedAt = new Map<string, number>();
  /** Of each open session, the connections that left after its last change: their copies are whole. */
  const leftSinceChange = new Map<string, string[]>();
  /**
   * A file's last session that ended with everything stored: the session ids whose copies are the
   * version it stored, and that version. A client whose connection dropped comes back with one, and
   * may restore into the next session at that version (DocsCoServer refuses a restore only for a
   * changed document or locks, DocsCoServer.js auth).
   */
  const ended = new Map<string, { ids: string[]; version: number }>();

  const membersOf = (fileId: string) =>
    [...connections.entries()].filter(([, connection]) => connection.fileId === fileId);

  const deliver = (fileId: string, from: string, out: Outgoing[]) => {
    for (const { to, message } of out) {
      for (const [id, connection] of membersOf(fileId)) {
        const wanted = to === "all" || (to === "self" ? id === from : id !== from);
        if (wanted) connection.send(message);
      }
    }
  };

  const apply = (
    fileId: string,
    from: string,
    step: (session: Session) => { session: Session; out: Outgoing[] },
  ) => {
    const session = sessions.get(fileId);
    if (!session) return;
    const result = step(session);
    sessions.set(fileId, result.session);
    deliver(fileId, from, result.out);
  };

  /**
   * A session nobody is connected to goes on from the newest version it stored, with the part of
   * its log that version lacks: the next person opens that version (the local server keeps no
   * older one to open) and replays the rest. With nothing left, the session ends. A client of the
   * old base cannot restore into it; its engine opens the document again.
   */
  const settle = (fileId: string) => {
    const session = sessions.get(fileId);
    if (!session || membersOf(fileId).length > 0) return;
    const stored = storedAt.get(fileId) ?? session.baseVersion;
    if (hasUnsavedChanges(session)) {
      if (session.savedIndex > 0) {
        const changes = session.changes.slice(session.savedIndex);
        sessions.set(fileId, { ...session, baseVersion: stored, changes, savedIndex: 0, sessionIds: [] });
      }
      return;
    }
    // Without a change everyone's copy is the version; with one, only those there to the end.
    const whole = session.changes.length === 0 ? session.sessionIds : (leftSinceChange.get(fileId) ?? []);
    ended.set(fileId, { ids: whole.slice(-ENDED_IDS_KEPT), version: stored });
    sessions.delete(fileId);
    storedAt.delete(fileId);
    leftSinceChange.delete(fileId);
  };

  const startSession = (fileId: string, version: number): Session => {
    const last = ended.get(fileId);
    ended.delete(fileId);
    storedAt.set(fileId, version);
    leftSinceChange.set(fileId, []);
    return { ...createSession(fileId, version), sessionIds: last?.version === version ? last.ids : [] };
  };

  return {
    /**
     * A new connection to a file. It first learns the version to open (our own `schreibzeug:session`
     * message, before anything sdkjs sees), then gets the license sdkjs waits for after connecting.
     * Returns its id, or null when the file does not exist.
     */
    open: async (fileId: string, user: HubUser, send: Send): Promise<string | null> => {
      const allowed = await access(fileId, user.id);
      if (allowed === null) return null;
      const { version } = allowed;
      // A version stored from outside while a kept session waited (a restored version, an upload)
      // is newer than the session's changes: it wins, as it would have without the session.
      if (membersOf(fileId).length === 0 && storedAt.get(fileId) !== version) sessions.delete(fileId);
      // Another connection may have started the session while we looked the version up.
      const session = sessions.get(fileId) ?? startSession(fileId, version);
      sessions.set(fileId, session);
      const connectionId = randomUUID();
      connections.set(connectionId, { fileId, user, viewer: allowed.role === "view", send });
      send({ type: "schreibzeug:session", baseVersion: session.baseVersion });
      send(licenseMessage());
      return connectionId;
    },

    message: (connectionId: string, data: Incoming) => {
      const connection = connections.get(connectionId);
      if (!connection) return;
      if (connection.viewer && CHANGING.has(String(data.type))) return;
      apply(connection.fileId, connectionId, (session) =>
        receive(session, connectionId, withUser(data, connection), now()),
      );
      if (data.type === "saveChanges") leftSinceChange.set(connection.fileId, []);
    },

    close: (connectionId: string) => {
      const connection = connections.get(connectionId);
      if (!connection) return;
      apply(connection.fileId, connectionId, (session) => disconnect(session, connectionId, now()));
      connections.delete(connectionId);
      leftSinceChange.get(connection.fileId)?.push(connectionId);
      settle(connection.fileId);
    },

    /**
     * A client stored the file as `version`, from the session that started at `baseVersion`,
     * holding the first `index` changes of its log (the save's SESSION_SAVE_HEADER). Told by the
     * save itself, so it counts even when the client's connection dropped meanwhile; a save from a
     * session that is gone is from outside for the one open now.
     */
    stored: (fileId: string, version: number, { baseVersion, index }: SessionSave) => {
      if (sessions.get(fileId)?.baseVersion !== baseVersion) return;
      storedAt.set(fileId, version);
      apply(fileId, "", (session) => markSaved(session, index));
      settle(fileId);
    },

    /** For tests and diagnostics: the session of a file, if one is open. */
    session: (fileId: string): Session | undefined => sessions.get(fileId),
  };
};

export type Hub = ReturnType<typeof createHub>;
