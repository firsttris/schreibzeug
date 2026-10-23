import { randomUUID } from "node:crypto";
import {
  createSession,
  disconnect,
  type Incoming,
  licenseMessage,
  type Outgoing,
  receive,
  type Session,
} from "./session";

/** Sends one message to one connection. */
export type Send = (message: Record<string, unknown>) => void;

/** Who is connected, as the server knows them from the session. */
export type HubUser = { id: string; name: string };

export type HubDeps = {
  /**
   * The newest version of a file outside the trash that the user may edit, or null when there is
   * none: every connection is checked, also to a session that is already open.
   */
  currentVersion: (fileId: string, userId: string) => Promise<number | null>;
  now?: () => number;
};

type Connection = { fileId: string; user: HubUser; send: Send };

/**
 * sdkjs announces its user in `auth` (docscoapi.js getAuthCommand). The relay replaces id and name
 * with the signed-in user's, so nobody can edit under someone else's name.
 */
const withUser = (data: Incoming, user: HubUser): Incoming =>
  data.type === "auth"
    ? { ...data, user: { ...(data.user as object | undefined), id: user.id, username: user.name } }
    : data;

/**
 * Holds the sessions of all open files and delivers what session.ts decides. A session starts
 * with the first connection to a file, at the file's newest version, and ends with the last one.
 * Messages are handled one at a time per process, which keeps the order of the change log.
 */
export const createHub = ({ currentVersion, now = Date.now }: HubDeps) => {
  const sessions = new Map<string, Session>();
  const connections = new Map<string, Connection>();

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

  return {
    /**
     * A new connection to a file. It first learns the version to open (our own `stapel:session`
     * message, before anything sdkjs sees), then gets the license sdkjs waits for after connecting.
     * Returns its id, or null when the file does not exist.
     */
    open: async (fileId: string, user: HubUser, send: Send): Promise<string | null> => {
      const version = await currentVersion(fileId, user.id);
      if (version === null) return null;
      // Another connection may have started the session while we looked the version up.
      const session = sessions.get(fileId) ?? createSession(fileId, version);
      sessions.set(fileId, session);
      const connectionId = randomUUID();
      connections.set(connectionId, { fileId, user, send });
      send({ type: "stapel:session", baseVersion: session.baseVersion });
      send(licenseMessage());
      return connectionId;
    },

    message: (connectionId: string, data: Incoming) => {
      const connection = connections.get(connectionId);
      if (!connection) return;
      apply(connection.fileId, connectionId, (session) =>
        receive(session, connectionId, withUser(data, connection.user), now()),
      );
    },

    close: (connectionId: string) => {
      const connection = connections.get(connectionId);
      if (!connection) return;
      apply(connection.fileId, connectionId, (session) => disconnect(session, connectionId, now()));
      connections.delete(connectionId);
      if (membersOf(connection.fileId).length === 0) sessions.delete(connection.fileId);
    },

    /** For tests and diagnostics: the session of a file, if one is open. */
    session: (fileId: string): Session | undefined => sessions.get(fileId),
  };
};

export type Hub = ReturnType<typeof createHub>;
