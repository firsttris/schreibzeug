import { describe, expect, it } from "vitest";
import { openWordDocument } from "../src/word";
import { createFakeEngine } from "./fake-engine";

const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
const options = { bytes, title: "Angebot.docx", user: { id: "u1", name: "Tristan" } };

const openReady = async () => {
  const engine = createFakeEngine();
  const opening = openWordDocument(engine.window, options);
  engine.api().emit("asc_onDocumentContentReady");
  return { engine, editor: await opening };
};

describe("openWordDocument", () => {
  it("opens in offline mode with the document info sdkjs needs", async () => {
    const { engine } = await openReady();
    expect(engine.api().docInfo).toMatchObject({
      Url: "_offline_",
      Title: "Angebot.docx",
      Format: "docx",
      Mode: "edit",
    });
  });

  it("hands the bytes to the engine when it asks for the local document", async () => {
    const { engine } = await openReady();
    const call = engine.api().calls.find(([name]) => name === "asc_openDocumentFromBytes");
    expect(call?.[1]).toBe(bytes);
  });

  it("follows the web-apps sequence: doc info, permissions, load", async () => {
    const { engine } = await openReady();
    const names = engine.api().calls.map(([name]) => name);
    const order = ["asc_setDocInfo", "asc_getEditorPermissions", "asc_LoadDocument"].map((n) =>
      names.indexOf(n),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is ready once the content is shown", async () => {
    const { editor } = await openReady();
    expect(editor.store.get().status).toBe("ready");
  });

  it("feeds engine events into the store", async () => {
    const { engine, editor } = await openReady();
    engine.api().emit("asc_onBold", true);
    engine.api().emit("asc_onFontSize", 14);
    engine.api().emit("asc_onCanUndo", true);
    expect(editor.store.get().text).toMatchObject({ bold: true, fontSize: 14 });
    expect(editor.store.get().document.canUndo).toBe(true);
  });

  it("notifies subscribers when the state changes", async () => {
    const { engine, editor } = await openReady();
    let calls = 0;
    const unsubscribe = editor.store.subscribe(() => {
      calls += 1;
    });
    engine.api().emit("asc_onItalic", true);
    unsubscribe();
    engine.api().emit("asc_onItalic", false);
    expect(calls).toBe(1);
  });

  it("saves the document as .docx bytes from the engine", async () => {
    const { engine, editor } = await openReady();
    const saved = await editor.save();
    expect(saved).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(engine.api().calls).toContainEqual(["saveLogicDocumentToZip", 0x41]);
  });

  it("rejects saving when the engine returns nothing", async () => {
    const { engine, editor } = await openReady();
    engine.api().saveResult = null;
    await expect(editor.save()).rejects.toThrow("could not write");
  });

  it("fails on a critical engine error", async () => {
    const engine = createFakeEngine();
    const opening = openWordDocument(engine.window, options);
    engine.api().emit("asc_onError", -82, -1);
    await expect(opening).rejects.toThrow("error -82");
  });

  it("ignores non-critical engine errors", async () => {
    const engine = createFakeEngine();
    const opening = openWordDocument(engine.window, options);
    engine.api().emit("asc_onError", 3, 0);
    engine.api().emit("asc_onDocumentContentReady");
    await expect(opening).resolves.toBeDefined();
  });

  it("gives up when the document does not open in time", async () => {
    const engine = createFakeEngine();
    await expect(openWordDocument(engine.window, { ...options, timeoutMs: 10 })).rejects.toThrow("in time");
  });
});
