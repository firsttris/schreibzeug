import type { SessionSave } from "@schreibzeug/files-api";
import { dropMessage, ENGINE_CLOSE, SOCKET_CLOSE } from "./limits";
import {
  createSession,
  disconnect,
  hasUnsavedChanges,
  type Incoming,
  type Issued,
  licenseMessage,
  markSaved,
  type Outgoing,
  receive,
  type Session,
} from "./session";

/** Sends one message to one connection. */
export type Send = (message: Record<string, unknown>) => void;

/**
 * Who is connected, as the server knows them from the session, and the id of that sign-in session:
 * when it ends, the connection does.
 */
export type HubUser = { id: string; name: string; session?: string };

/** What the user may do with a file: its newest version, and whether they may change it. */
export type FileAccess = { version: number; role: "owner" | "edit" | "view" };

export type HubDeps = {
  /**
   * The file outside the trash as the user may use it, or null when they may not open it: every
   * connection is checked, also to a session that is already open, and again on `revalidate`.
   */
  access: (fileId: string, userId: string) => Promise<FileAccess | null>;
  now?: () => number;
  /** How long a session nobody is in waits with changes no version holds (IDLE_SESSION_MS). */
  idleMs?: number;
  /** Runs `run` after `ms`; returns what cancels it. */
  setTimer?: (run: () => void, ms: number) => () => void;
};

/**
 * How long a session nobody is in keeps changes no stored version holds, for a client to restore
 * them or the next person to save them. A client that lost its connection gives up after a few
 * minutes (editor-core collab.ts); after that the changes would only hold memory.
 */
export const IDLE_SESSION_MS = 60 * 60 * 1000;

/** A timer that does not keep the process alive. */
const unrefTimer = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms) as unknown as { unref?: () => void };
  timer.unref?.();
  return () => clearTimeout(timer as unknown as number);
};

/** Closes one connection's socket. */
export type Close = (code: number, reason: string) => void;

type Connection = { fileId: string; user: HubUser; viewer: boolean; send: Send; close: Close };

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
export const createHub = ({
  access,
  now = Date.now,
  idleMs = IDLE_SESSION_MS,
  setTimer = unrefTimer,
}: HubDeps) => {
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
  const ended = new Map<string, { ids: Issued[]; version: number; baseVersion: number }>();
  /** How many sessions each file has had in this process: which one a session is. */
  const generations = new Map<string, number>();

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

  /** How many saves of each file's session are under way (`begin` to `stored` or `abandon`). */
  const saving = new Map<string, number>();
  const saveDone = (fileId: string) => {
    const left = (saving.get(fileId) ?? 0) - 1;
    if (left > 0) saving.set(fileId, left);
    else saving.delete(fileId);
  };

  /** Of each session nobody is in, what cancels its wait (`waitIdle`). */
  const idleTimers = new Map<string, () => void>();
  const stopIdle = (fileId: string) => {
    idleTimers.get(fileId)?.();
    idleTimers.delete(fileId);
  };

  const forget = (fileId: string) => {
    sessions.delete(fileId);
    storedAt.delete(fileId);
    leftSinceChange.delete(fileId);
    stopIdle(fileId);
  };

  /**
   * A session nobody is in waits IDLE_SESSION_MS for someone; then it ends, with changes no stored
   * version holds lost, unless a save is still under way.
   */
  const waitIdle = (fileId: string) => {
    stopIdle(fileId);
    const expire = () => {
      idleTimers.delete(fileId);
      const session = sessions.get(fileId);
      if (!session || membersOf(fileId).length > 0) return;
      if (saving.has(fileId)) waitIdle(fileId);
      else if (hasUnsavedChanges(session)) forget(fileId);
      else settle(fileId);
    };
    idleTimers.set(fileId, setTimer(expire, idleMs));
  };

  /**
   * When the last person leaves, the session ends if a stored version holds its whole log and no
   * save is under way (one that lands later would be the newest version, and may hold less).
   * Otherwise it waits (`waitIdle`).
   */
  const settle = (fileId: string) => {
    const session = sessions.get(fileId);
    if (!session || membersOf(fileId).length > 0) return;
    if (hasUnsavedChanges(session) || saving.has(fileId)) {
      waitIdle(fileId);
      return;
    }
    // Without a change everyone's copy is the version; with one, only those there to the end.
    const left = leftSinceChange.get(fileId) ?? [];
    const whole =
      session.changes.length === 0
        ? session.issued
        : session.issued.filter(({ sessionId }) => left.includes(sessionId));
    ended.set(fileId, {
      ids: whole.slice(-ENDED_IDS_KEPT),
      version: storedAt.get(fileId) ?? session.baseVersion,
      baseVersion: session.baseVersion,
    });
    forget(fileId);
  };

  const startSession = (fileId: string, version: number): Session => {
    const last = ended.get(fileId);
    ended.delete(fileId);
    generations.set(fileId, (generations.get(fileId) ?? 0) + 1);
    storedAt.set(fileId, version);
    leftSinceChange.set(fileId, []);
    const issued = last?.version === version ? last.ids : [];
    // A restore hands back the index an inherited id had; new joiners must start past all of them.
    const nextIndexUser = Math.max(1, ...issued.map(({ indexUser }) => indexUser + 1));
    return { ...createSession(fileId, version), issued, nextIndexUser };
  };

  /** A connection is gone: its locks are freed, and the session may end. */
  const leave = (connectionId: string) => {
    const connection = connections.get(connectionId);
    if (!connection) return;
    apply(connection.fileId, connectionId, (session) => disconnect(session, connectionId, now()));
    connections.delete(connectionId);
    leftSinceChange.get(connection.fileId)?.push(connectionId);
    settle(connection.fileId);
  };

  /**
   * Sends a connection away for good: its engine gets `drop` and stops reconnecting (limits.ts
   * dropMessage), it leaves the session at once, so nothing more reaches it or comes from it, and
   * its socket closes.
   */
  const eject = (connectionId: string, engineCode: number, socketCode: number, reason: string) => {
    const connection = connections.get(connectionId);
    if (!connection) return;
    connection.send(dropMessage(engineCode, reason));
    leave(connectionId);
    connection.close(socketCode, reason);
  };

  /** Sends away the connections whose sign-in ended (sdkjs shows "session expired"). */
  const signOut = (which: (connection: Connection) => boolean) => {
    for (const [id, connection] of [...connections]) {
      if (which(connection)) eject(id, ENGINE_CLOSE.sessionAbsolute, SOCKET_CLOSE.signedOut, "Signed out");
    }
  };

  return {
    /**
     * A new connection to a file. It first learns the version to open (our own `schreibzeug:session`
     * message, before anything sdkjs sees), then gets the license sdkjs waits for after connecting.
     * Returns its id, or null when the file does not exist.
     */
    open: async (
      fileId: string,
      user: HubUser,
      send: Send,
      close: Close = () => {},
    ): Promise<string | null> => {
      const allowed = await access(fileId, user.id);
      if (allowed === null) return null;
      const { version } = allowed;
      stopIdle(fileId);
      // A version stored from outside while a kept session waited (a restored version, an upload)
      // is newer than the session's changes: it wins, as it would have without the session.
      if (membersOf(fileId).length === 0 && storedAt.get(fileId) !== version) sessions.delete(fileId);
      // Another connection may have started the session while we looked the version up.
      const session = sessions.get(fileId) ?? startSession(fileId, version);
      sessions.set(fileId, session);
      const connectionId = crypto.randomUUID();
      connections.set(connectionId, { fileId, user, viewer: allowed.role === "view", send, close });
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

    /** The connection's socket closed. */
    close: leave,

    /**
     * Checks every open connection against the files again, after something may have changed who
     * may open what (a share, the trash, a move): whoever lost the file is sent away, whoever may
     * now only look too, for their engine to open it again as a viewer (DocsCoServer drops a
     * connection whose rights changed). Someone who may now edit stays a viewer until they reopen.
     */
    revalidate: async (): Promise<void> => {
      const checks = [...connections.entries()].map(async ([id, { fileId, user }]) => {
        const allowed = await access(fileId, user.id);
        const connection = connections.get(id);
        if (!connection) return;
        if (allowed === null) eject(id, ENGINE_CLOSE.accessDeny, SOCKET_CLOSE.revoked, "Access revoked");
        else if (allowed.role === "view" && !connection.viewer)
          eject(id, ENGINE_CLOSE.accessDeny, SOCKET_CLOSE.revoked, "Access changed to view");
      });
      await Promise.all(checks);
    },

    /** A sign-in session ended (signed out, revoked): its connections are sent away. */
    closeSession: (sessionId: string) => signOut(({ user }) => user.session === sessionId),

    /** All of a user's sessions ended (Kontext's lockout, bearer.ts): their connections are sent away. */
    closeUser: (userId: string) => signOut(({ user }) => user.id === userId),

    /**
     * A save from a shared session starts (files-api SessionSaves): false when its copy is known
     * to be old. Until it is stored or abandoned, the file's session does not end.
     */
    begin: (fileId: string, { baseVersion }: SessionSave): boolean => {
      const session = sessions.get(fileId);
      // Old for sure: another session is open, or the one it comes from ended with its log stored.
      // Without either (the server restarted), the editor's copy may be the only one of its changes.
      const old = session
        ? session.baseVersion !== baseVersion
        : ended.get(fileId)?.baseVersion === baseVersion;
      if (old) return false;
      saving.set(fileId, (saving.get(fileId) ?? 0) + 1);
      return true;
    },

    /**
     * A save begun was stored as `version`, holding the first `index` changes of its session's log
     * (the save's SESSION_SAVE_HEADER). Told by the save itself, so it counts even when the client's
     * connection dropped meanwhile. A session nobody is in waits for the next person or close.
     */
    stored: (fileId: string, version: number, { baseVersion, index }: SessionSave) => {
      saveDone(fileId);
      if (sessions.get(fileId)?.baseVersion !== baseVersion) return;
      storedAt.set(fileId, version);
      apply(fileId, "", (session) => markSaved(session, index));
    },

    /** A save begun stored nothing (it failed). */
    abandon: (fileId: string) => saveDone(fileId),

    /** For tests and diagnostics: the session of a file, if one is open. */
    session: (fileId: string): Session | undefined => sessions.get(fileId),

    /** Which of the file's sessions in this process is open, if one is: 1 for the first. */
    generation: (fileId: string): number | undefined =>
      sessions.has(fileId) ? generations.get(fileId) : undefined,
  };
};

export type Hub = ReturnType<typeof createHub>;
