import { describe, expect, it } from "vitest";
import type { Convert } from "../src/converter";
import { openWordDocument } from "../src/word";
import { createFakeEngine } from "./fake-engine";

const docx = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
const binary = new Uint8Array([68, 79, 67, 89]);
const savedDocx = new Uint8Array([80, 75, 9, 9]);

type Conversion = { bytes: Uint8Array; from: string; to: string };

const fakeConverter = () => {
  const conversions: Conversion[] = [];
  const convert: Convert = async (bytes, from, to) => {
    conversions.push({ bytes, from, to });
    return from === "docx" ? binary : savedDocx;
  };
  return { convert, conversions };
};

const optionsWith = (convert: Convert, extra: Partial<Parameters<typeof openWordDocument>[1]> = {}) => ({
  bytes: docx,
  title: "Angebot.docx",
  user: { id: "u1", name: "Tristan" },
  convert,
  ...extra,
});

/** Lets the conversion promise settle, so the engine API exists. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const openReady = async () => {
  const engine = createFakeEngine();
  const converter = fakeConverter();
  const opening = openWordDocument(engine.window, optionsWith(converter.convert));
  await flush();
  engine.api().emit("asc_onDocumentContentReady");
  return { engine, converter, editor: await opening };
};

describe("openWordDocument", () => {
  it("converts the .docx into the engine's binary format before opening", async () => {
    const { converter } = await openReady();
    expect(converter.conversions[0]).toEqual({ bytes: docx, from: "docx", to: "bin" });
  });

  it("hands the converted bytes to the engine when it asks for the local document", async () => {
    const { engine } = await openReady();
    const call = engine.api().calls.find(([name]) => name === "asc_openDocumentFromBytes");
    expect(call?.[1]).toBe(binary);
  });

  it("opens in offline mode with the document info sdkjs needs", async () => {
    const { engine } = await openReady();
    expect(engine.api().docInfo).toMatchObject({
      Url: "_offline_",
      Title: "Angebot.docx",
      Format: "docx",
      Mode: "edit",
    });
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

  it("switches the spell checker off, since no dictionaries are served", async () => {
    const { engine } = await openReady();
    expect(engine.api().calls).toContainEqual(["asc_setSpellCheck", false]);
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

  it("saves by converting the engine's binary back to .docx", async () => {
    const { engine, converter, editor } = await openReady();
    const saved = await editor.save();
    expect(saved).toBe(savedDocx);
    const conversion = converter.conversions.at(-1);
    expect(conversion).toMatchObject({ from: "bin", to: "docx" });
    expect(new TextDecoder().decode(conversion?.bytes)).toBe(engine.api().nativeFile);
  });

  it("reads the modified flag from the engine, since the event carries none", async () => {
    const { engine, editor } = await openReady();
    engine.api().modified = true;
    engine.api().emit("asc_onDocumentModifiedChanged");
    expect(editor.store.get().document.modified).toBe(true);

    editor.markSaved();
    expect(engine.api().calls).toContainEqual(["SetUnchangedDocument"]);
    expect(editor.store.get().document.modified).toBe(false);
  });

  it("fails when the file cannot be converted", async () => {
    const engine = createFakeEngine();
    const convert: Convert = async () => {
      throw new Error("x2t could not convert docx to bin (code 89)");
    };
    await expect(openWordDocument(engine.window, optionsWith(convert))).rejects.toThrow("code 89");
  });

  it("fails on a critical engine error", async () => {
    const engine = createFakeEngine();
    const opening = openWordDocument(engine.window, optionsWith(fakeConverter().convert));
    await flush();
    engine.api().emit("asc_onError", -82, -1);
    await expect(opening).rejects.toThrow("error -82");
  });

  it("ignores non-critical engine errors", async () => {
    const engine = createFakeEngine();
    const opening = openWordDocument(engine.window, optionsWith(fakeConverter().convert));
    await flush();
    engine.api().emit("asc_onError", 3, 0);
    engine.api().emit("asc_onDocumentContentReady");
    await expect(opening).resolves.toBeDefined();
  });

  it("gives up when the document does not open in time", async () => {
    const engine = createFakeEngine();
    await expect(
      openWordDocument(engine.window, optionsWith(fakeConverter().convert, { timeoutMs: 10 })),
    ).rejects.toThrow("in time");
  });
});
