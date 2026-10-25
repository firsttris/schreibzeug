import { randomUUID } from "node:crypto";
import { AGENT_NOT_OPEN, type AgentCommand, type AgentJob, type AgentReply } from "@schreibzeug/files-api";
import { fail, ok, type Result } from "../result";

/** Sends one job to one tab. */
export type SendJob = (job: AgentJob) => void;

type Tab = { userId: string; fileId: string; send: SendJob; since: number };
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

  return {
    /** A tab with the file open; returns its id. */
    join: (userId: string, fileId: string, send: SendJob): string => {
      const id = randomUUID();
      tabs.set(id, { userId, fileId, send, since: now() });
      return id;
    },

    leave: (tabId: string) => {
      tabs.delete(tabId);
      finishAll(tabId, "Der Tab mit dem Dokument wurde geschlossen, bevor der Auftrag fertig war.");
    },

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
