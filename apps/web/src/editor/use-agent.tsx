import {
  type AgentCommand,
  type AgentOutcome,
  type CoreState,
  type EditorKind,
  type OpenedDocument,
  runAgentCommand,
  type SearchCommands,
} from "@schreibzeug/editor-core";
import { type AgentCommand as AgentJobCommand, agentJobSchema } from "@schreibzeug/files-api";
import { Bot } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFiles } from "../api/context";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** Whether the person let an assistant work in this document, in this tab. */
type Consent = "unasked" | "asking" | "allowed" | "stopped" | "declined";

export type AgentDeps = {
  fileId: string | undefined;
  editor:
    | (Pick<OpenedDocument<CoreState>, "runBuilder" | "exportPdf"> & { search?: SearchCommands | null })
    | null;
  kind: EditorKind;
  state: Pick<CoreState, "status">;
  readOnly: boolean;
  /** Saves the document as a new version, as the save button does. */
  save: () => Promise<void>;
  /** Stores a new file beside the document (a PDF made from it); resolves with its name. */
  onCreateFile?: ((name: string, bytes: Uint8Array, type: string) => Promise<string>) | undefined;
  name: string;
};

const baseName = (name: string) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

/**
 * An assistant's jobs for the open document (plan "MCP-Server", phase 4): the tab takes them over
 * its own WebSocket (apps/server src/agent), asks the person once per document and tab, shows a
 * bar while the assistant may work with a button to stop it, runs each job in the engine
 * (editor-core agent.ts) and saves the result as a new version. Only a document open for editing
 * on a Schreibzeug server takes jobs.
 */
export const useAgent = ({ fileId, editor, kind, state, readOnly, save, onCreateFile, name }: AgentDeps) => {
  const { agentUrl, info } = useFiles();
  const [consent, setConsent] = useState<Consent>("unasked");
  const [working, setWorking] = useState(false);
  const consentRef = useRef<Consent>("unasked");
  const waiting = useRef<((allowed: boolean) => void)[]>([]);
  const ready =
    editor !== null &&
    state.status === "ready" &&
    !readOnly &&
    fileId !== undefined &&
    info.mode === "server";

  const decide = useCallback((next: Consent) => {
    consentRef.current = next;
    setConsent(next);
    if (next === "allowed" || next === "declined") {
      for (const answer of waiting.current.splice(0)) answer(next === "allowed");
    }
  }, []);

  /** Whether a job may run: asks the first time, waits for the answer. */
  const allowed = useCallback(async (): Promise<boolean> => {
    const now = consentRef.current;
    if (now === "allowed") return true;
    if (now === "stopped" || now === "declined") return false;
    if (now === "unasked") decide("asking");
    return new Promise((resolve) => waiting.current.push(resolve));
  }, [decide]);

  const execute = useCallback(
    async (command: AgentJobCommand): Promise<AgentOutcome> => {
      // i18n-ignore: replies to the agent are data for the MCP client, not interface texts
      if (!editor) return { ok: false, text: "Der Editor ist nicht bereit." };
      if (command.type === "exportPdf") {
        if (!editor.exportPdf || !onCreateFile)
          // i18n-ignore: a reply to the agent (data, see above)
          return { ok: false, text: "Dieses Dokument lässt sich hier nicht als PDF ablegen." };
        const pdf = await editor.exportPdf(command.pdfa);
        const stored = await onCreateFile(`${baseName(name)}.pdf`, pdf, "application/pdf");
        // i18n-ignore: a reply to the agent (data, see above)
        return { ok: true, text: `Als „${stored}“ abgelegt.` };
      }
      const outcome = await runAgentCommand(
        { runBuilder: editor.runBuilder, search: editor.search },
        kind,
        command as AgentCommand,
      );
      // A change is stored right away, so it is a version of its own the person can go back to.
      if (outcome.ok && command.type !== "outline") await save();
      return outcome;
    },
    [editor, kind, name, onCreateFile, save],
  );

  // The socket stays while the document is open; the job runs with what is current then.
  const executeRef = useRef(execute);
  executeRef.current = execute;

  useEffect(() => {
    if (!ready || !fileId) return;
    const socket = new WebSocket(agentUrl(fileId));
    socket.onmessage = async (event) => {
      const parsed = agentJobSchema.safeParse(JSON.parse(String(event.data)));
      if (!parsed.success) return;
      const { id, command } = parsed.data;
      const reply = (outcome: AgentOutcome) =>
        socket.readyState === WebSocket.OPEN &&
        socket.send(JSON.stringify({ type: "result", id, ...outcome }));
      // Reading the outline changes nothing; it needs no consent.
      if (command.type !== "outline" && !(await allowed())) {
        reply({
          ok: false,
          text:
            // i18n-ignore: replies to the agent (data, see above)
            consentRef.current === "stopped"
              ? "Die Person hat Claude in diesem Dokument angehalten."
              : // i18n-ignore: a reply to the agent (data, see above)
                "Die Person hat das Bearbeiten durch Claude in diesem Dokument abgelehnt.",
        });
        return;
      }
      setWorking(true);
      try {
        reply(await executeRef.current(command));
      } catch (error) {
        reply({ ok: false, text: error instanceof Error ? error.message : String(error) });
      } finally {
        setWorking(false);
      }
    };
    return () => socket.close();
  }, [ready, fileId, agentUrl, allowed]);

  const bar =
    consent === "allowed" || consent === "stopped" ? (
      <section
        // i18n-ignore: the assistant's name
        aria-label="Claude"
        className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-1.5 text-xs"
      >
        <Bot size={14} aria-hidden />
        <span role="status">
          {consent === "stopped"
            ? m.use_agent_stopped()
            : working
              ? m.use_agent_working()
              : m.use_agent_allowed()}
        </span>
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => decide(consent === "stopped" ? "allowed" : "stopped")}
        >
          {consent === "stopped" ? m.use_agent_resume() : m.use_agent_stop()}
        </Button>
      </section>
    ) : null;

  const dialog = (
    <Dialog
      open={consent === "asking"}
      title={m.use_agent_consent_title()}
      onClose={() => {
        // The dialog also closes after a choice; only closing it while asking declines.
        if (consentRef.current === "asking") decide("declined");
      }}
    >
      <p className="m-0 text-sm">{m.use_agent_consent_text({ name })}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => decide("declined")}>
          {m.use_agent_decline()}
        </Button>
        <Button variant="primary" onClick={() => decide("allowed")}>
          {m.use_agent_allow()}
        </Button>
      </div>
    </Dialog>
  );

  return { bar, dialog };
};
