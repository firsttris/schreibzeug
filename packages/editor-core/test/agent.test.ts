import { describe, expect, it } from "vitest";
import { type AgentCommand, filledRange, runAgentCommand } from "../src/agent";

/** A runBuilder that keeps the script and answers with the given value. */
const answering = (value: unknown) => {
  const scripts: string[] = [];
  return {
    scripts,
    run: async (script: string) => {
      scripts.push(script);
      return value;
    },
  };
};

describe("jobs for the open editor", () => {
  it("numbers the elements of a text document", async () => {
    const engine = answering([
      { type: "paragraph", text: "Angebot", style: "Heading 1" },
      { type: "paragraph", text: "", style: "Normal" },
      { type: "table", rows: 3 },
    ]);
    expect(await runAgentCommand({ runBuilder: engine.run }, "word", { type: "outline" })).toEqual({
      ok: true,
      text: "1. [Heading 1] Angebot\n2. (leer)\n3. [Tabelle, 3 Zeilen]",
    });
    // A function around the script, so it may return.
    expect(engine.scripts[0]).toMatch(/^\(function \(\) \{\n[\s\S]*Api\.GetDocument\(\)[\s\S]*\}\)\(\);$/);
  });

  it("replaces with the search bar's commands and counts the matches", async () => {
    const calls: string[] = [];
    const search = (matches: number) => ({
      find: (query: { text: string }) => {
        calls.push(`find ${query.text}`);
        return matches;
      },
      replace: () => false,
      replaceAll: (_query: unknown, replacement: string) => calls.push(`replaceAll ${replacement}`),
      end: () => calls.push("end"),
    });
    const command: AgentCommand = { type: "replaceText", search: "Alt", replace: "Neu", matchCase: true };
    const builder = answering(undefined);
    expect(await runAgentCommand({ runBuilder: builder.run, search: search(2) }, "word", command)).toEqual({
      ok: true,
      text: "2-mal ersetzt.",
    });
    expect(calls).toEqual(["find Alt", "replaceAll Neu", "end"]);
    expect(builder.scripts).toEqual([]);
    expect(
      (await runAgentCommand({ runBuilder: builder.run, search: search(0) }, "word", command)).text,
    ).toContain("nichts ersetzt");
  });

  it("hands its input to the script as a literal", async () => {
    const engine = answering({ inserted: 1, at: 1 });
    const command: AgentCommand = {
      type: "insertContent",
      blocks: [{ kind: "paragraph", level: 0, runs: [{ text: 'Firma "X"' }] }],
      position: "end",
    };
    await runAgentCommand({ runBuilder: engine.run }, "word", command);
    expect(engine.scripts[0]).toContain(`const input = ${JSON.stringify(command)};`);
  });

  it("says where an insert cannot go", async () => {
    const command: AgentCommand = {
      type: "insertContent",
      blocks: [{ kind: "paragraph", level: 0, runs: [{ text: "x" }] }],
      position: { after: 99 },
    };
    expect(await runAgentCommand({ runBuilder: answering({ error: 4 }).run }, "word", command)).toEqual({
      ok: false,
      text: "Diese Stelle gibt es nicht: Das Dokument hat 4 Elemente (outline).",
    });
  });

  it("fills a range of a sheet from its top left cell", async () => {
    expect(filledRange("B2", [[1, 2, 3], [4]])).toBe("B2:D3");
    expect(filledRange("Z9:AA10", [["a", "b"]])).toBe("Z9:AA9");
    const engine = answering({ sheet: "Preise", range: "A1:B1" });
    const result = await runAgentCommand({ runBuilder: engine.run }, "cell", {
      type: "setCells",
      range: "A1",
      values: [[1, "=A1*2"]],
    });
    expect(result).toEqual({ ok: true, text: "A1:B1 auf Blatt „Preise“ gesetzt." });
    expect(engine.scripts[0]).toContain('"target":"A1:B1"');
  });

  it("refuses what an editor cannot do, and reports what the engine threw", async () => {
    const engine = answering(undefined);
    expect(
      await runAgentCommand({ runBuilder: engine.run }, "slide", {
        type: "replaceText",
        search: "a",
        replace: "b",
        matchCase: true,
      }),
    ).toMatchObject({ ok: false });
    expect(engine.scripts).toEqual([]);
    const failing = async () => {
      throw new Error("kaputt");
    };
    expect(await runAgentCommand({ runBuilder: failing }, "word", { type: "outline" })).toEqual({
      ok: false,
      text: "Die Engine hat den Auftrag nicht ausgeführt: kaputt",
    });
  });
});
