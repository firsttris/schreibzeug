import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type AgentJob, nodeSchema } from "@schreibzeug/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./harness";
import { call, connect, ORIGIN, tokenFor } from "./mcp-client";

/*
 * Editing in the open tab, with the tab stood in for: it joins the server's agent hub as the web
 * app's WebSocket does (apps/server src/agent/routes.ts) and answers each job it gets. The engine's
 * part is covered by editor-core's tests and e2e/mcp-edit.spec.ts.
 */

let server: TestServer;
let anna: string;
let annaId: string;
let client: Client;
beforeAll(async () => {
  server = await startServer();
  anna = await server.signUp("Anna");
  client = await connect(server, await tokenFor(server, anna, "write"));
  const session = await (
    await server.app.request("/api/auth/get-session", { headers: { cookie: anna } })
  ).json();
  annaId = (session as { user: { id: string } }).user.id;
});
afterAll(() => server?.stop());

const document = async (name: string, cookie = anna) =>
  nodeSchema.parse(
    await (
      await server.app.request("/api/files/blank", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: null, format: "docx" }),
      })
    ).json(),
  );

/** A tab with the file open that answers every job with `answer` and keeps what it got. */
const openTab = (
  fileId: string,
  answer: (job: AgentJob) => { ok: boolean; text: string },
  userId = annaId,
) => {
  const jobs: AgentJob[] = [];
  const tab = server.agent.join(userId, fileId, (job) => {
    jobs.push(job);
    queueMicrotask(() => server.agent.reply(tab, { type: "result", id: job.id, ...answer(job) }));
  });
  return { jobs, close: () => server.agent.leave(tab) };
};

describe("editing in the open tab over MCP", () => {
  it("says to open the document when no tab has it, with the link", async () => {
    const file = await document("Zu");
    expect(await call(client, "replace_text", { id: file.id, search: "a", replace: "b" })).toEqual({
      isError: true,
      text: `Das Dokument ist gerade in keinem Tab geöffnet. Bitte öffne es in Schreibzeug (${ORIGIN}/edit/${file.id}); dann rufe das Werkzeug noch einmal auf.`,
    });
  });

  it("hands the job to the tab and gives back its answer", async () => {
    const file = await document("Offen");
    const tab = openTab(file.id, () => ({ ok: true, text: "2-mal ersetzt." }));
    expect(await call(client, "replace_text", { id: file.id, search: "Alt", replace: "Neu" })).toEqual({
      isError: false,
      text: "2-mal ersetzt.",
    });
    expect(tab.jobs[0]?.command).toEqual({
      type: "replaceText",
      search: "Alt",
      replace: "Neu",
      matchCase: true,
    });

    await call(client, "insert_content", {
      id: file.id,
      markdown: "## Neu\n\n- **eins**",
      position: { after: 2 },
    });
    expect(tab.jobs[1]?.command).toEqual({
      type: "insertContent",
      position: { after: 2 },
      blocks: [
        { kind: "heading", level: 2, runs: [{ text: "Neu" }] },
        { kind: "bullet", level: 0, runs: [{ text: "eins", bold: true }] },
      ],
    });
    tab.close();
  });

  it("passes on the tab's refusal, and its absence once closed", async () => {
    const file = await document("Abgelehnt");
    const tab = openTab(file.id, () => ({
      ok: false,
      text: "Die Person hat das Bearbeiten durch Claude in diesem Dokument abgelehnt.",
    }));
    expect(await call(client, "set_cells", { id: file.id, range: "A1", values: [[1]] })).toMatchObject({
      isError: true,
    });
    tab.close();
    expect((await call(client, "outline", { id: file.id })).text).toContain("in keinem Tab geöffnet");
  });

  it("goes to the newest tab of the same person only", async () => {
    const file = await document("Zwei Tabs");
    const older = openTab(file.id, () => ({ ok: true, text: "alt" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = openTab(file.id, () => ({ ok: true, text: "neu" }));
    expect((await call(client, "outline", { id: file.id })).text).toBe("neu");
    expect(older.jobs).toEqual([]);
    older.close();
    newer.close();

    const ben = await server.signUp("Ben");
    const bens = await document("Bens", ben);
    const foreign = openTab(bens.id, () => ({ ok: true, text: "fremd" }), "someone-else");
    expect((await call(client, "outline", { id: bens.id })).text).toBe(
      "Die Datei oder der Ordner existiert nicht.",
    );
    foreign.close();
  });

  it("gives up on a tab that does not answer", async () => {
    const file = await document("Stumm");
    const tab = server.agent.join(annaId, file.id, () => {});
    expect(await call(client, "outline", { id: file.id })).toEqual({
      isError: true,
      text: "Der Tab hat nicht rechtzeitig geantwortet.",
    });
    server.agent.leave(tab);
  });

  it("lets a read-only token see the outline but no tool that edits", async () => {
    const reader = await connect(server, await tokenFor(server, anna, "read"));
    const names = (await reader.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("outline");
    expect(names).not.toContain("replace_text");
    const file = await document("Lesen");
    const tab = openTab(file.id, () => ({ ok: true, text: "1. Hallo" }));
    expect((await call(reader, "outline", { id: file.id })).text).toBe("1. Hallo");
    tab.close();
  });
});
