import { randomUUID } from "node:crypto";
import { AGENT_NOT_OPEN, type AgentCommand, type AgentJob, type AgentReply } from "@schreibzeug/files-api";
import { SOCKET_CLOSE } from "../collab/limits";
import { fail, ok, type Result } from "../result";

/** Sends one job to one tab. */
export type SendJob = (job: AgentJob) => void;

/** Closes a tab's socket. */
export type CloseTab = (code: number, reason: string) => void;

type Tab = { userId: string; fileId: string; send: SendJob; close: CloseTab; since: number };
type Pending = { tabId: string; finish: (result: Result<string>) => void };

/** How long a tab has for a job; the engine is quick, a person may still be asked to agree. */
export const JOB_TIMEOUT_MS = 120_000;

/**
 * Jobs for open editors (plan "MCP-Server", phase 4): every tab with a document open for editing
 * says so here, and a job for that user and file goes to the tab that joined last, the one the
 * person most likely looks at. The tab answers with a text or why it did not run. Nothing is kept
 * beyond the open tabs and the jobs underway.
 */
export const createAgentHub = ({ timeoutMs = JOB_TIMEOUT_MS, now = Date.now } = {}) => {
  const tabs = new Map<string, Tab>();
  const pending = new Map<string, Pending>();

  const finishAll = (tabId: string, message: string) => {
    for (const [id, job] of pending) {
      if (job.tabId !== tabId) continue;
      pending.delete(id);
      job.finish(fail("conflict", message));
    }
  };

  const leave = (tabId: string) => {
    tabs.delete(tabId);
    finishAll(tabId, "Der Tab mit dem Dokument wurde geschlossen, bevor der Auftrag fertig war.");
  };

  /** Sends away the tabs `which` picks: they take no more jobs, and their sockets close. */
  const closeWhere = (which: (tab: Tab) => boolean, code: number, reason: string) => {
    for (const [id, tab] of [...tabs]) {
      if (!which(tab)) continue;
      leave(id);
      tab.close(code, reason);
    }
  };

  return {
    /** A tab with the file open; returns its id. */
    join: (userId: string, fileId: string, send: SendJob, close: CloseTab = () => {}): string => {
      const id = randomUUID();
      tabs.set(id, { userId, fileId, send, close, since: now() });
      return id;
    },

    leave,

    /**
     * Checks every tab again, after something may have changed who may edit what (a share, the
     * trash, a move): a tab whose user may no longer edit its file is sent away.
     */
    revalidate: (mayEdit: (userId: string, fileId: string) => boolean) =>
      closeWhere((tab) => !mayEdit(tab.userId, tab.fileId), SOCKET_CLOSE.revoked, "Access revoked"),

    /** The tab's answer to a job it was given. */
    reply: (tabId: string, reply: AgentReply) => {
      const job = pending.get(reply.id);
      if (!job || job.tabId !== tabId) return;
      pending.delete(reply.id);
      job.finish(reply.ok ? ok(reply.text) : fail("conflict", reply.text));
    },

    /** Runs a command in the user's newest tab with the file; without one, says it is not open. */
    dispatch: (userId: string, fileId: string, command: AgentCommand): Promise<Result<string>> => {
      const candidates = [...tabs.entries()]
        .filter(([, tab]) => tab.userId === userId && tab.fileId === fileId)
        .sort(([, a], [, b]) => b.since - a.since);
      const [chosen] = candidates;
      if (!chosen) return Promise.resolve(fail("conflict", AGENT_NOT_OPEN));
      const [tabId, tab] = chosen;
      const id = randomUUID();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(fail("conflict", "Der Tab hat nicht rechtzeitig geantwortet."));
        }, timeoutMs);
        pending.set(id, {
          tabId,
          finish: (result) => {
            clearTimeout(timer);
            resolve(result);
          },
        });
        tab.send({ type: "job", id, command });
      });
    },
  };
};

export type AgentHub = ReturnType<typeof createAgentHub>;
