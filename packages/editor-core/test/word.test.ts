import { describe, expect, it } from "vitest";
import type { Convert } from "../src/converter";
import { hasUnsavedChanges } from "../src/core-state";
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
/** An asc_CSelectedObject of the given c_oAscTypeSelectElement type. */
const selected = (type: number) => ({ asc_getObjectType: () => type });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const openReady = async () => {
  const engine = createFakeEngine();
  const converter = fakeConverter();
  const opening = openWordDocument(engine.window, optionsWith(converter.convert));
  await flush();
  engine.api().emit("asc_onDocumentContentReady");
  return { engine, converter, editor: await opening };
};

/** A channel that records what is sent; the test plays the relay for observers, not the engine. */
const testChannel = () => {
  const sent: string[] = [];
  const observers = new Set<(json: string) => void>();
  return {
    sent,
    relay: (message: object) => {
      for (const observer of observers) observer(JSON.stringify(message));
    },
    channel: {
      baseVersion: 1,
      send: (json: string) => {
        sent.push(json);
      },
      listen: () => () => {},
      observe: (observer: (json: string) => void) => {
        observers.add(observer);
        return () => observers.delete(observer);
      },
      close: () => {},
    },
  };
};

const openShared = async () => {
  const engine = createFakeEngine();
  Object.assign(engine.window, { URL: { createObjectURL: () => "blob:document" }, Blob, JSON });
  const converter = fakeConverter();
  const relay = testChannel();
  const opening = openWordDocument(
    engine.window,
    optionsWith(converter.convert, { collaboration: { channel: relay.channel, documentId: "file-1" } }),
  );
  await flush();
  engine.api().emit("asc_onDocumentContentReady");
  return { engine, relay, editor: await opening };
};

describe("openWordDocument in a shared session", () => {
  it("leaves offline mode: the document has the file's id and a blob URL, and edits fast", async () => {
    const { engine } = await openShared();
    expect(engine.api().docInfo).toMatchObject({ Id: "file-1", Url: "blob:document", CoEditingMode: "fast" });
    expect(engine.api().calls.some(([name]) => name === "asc_openDocumentFromBytes")).toBe(false);
  });

  it("gives the engine a socket.io stand-in", async () => {
    const { engine } = await openShared();
    expect(typeof engine.window.io).toBe("function");
  });

  it("follows the change log and tells the relay how much a save holds", async () => {
    const { relay, editor } = await openShared();
    relay.relay({ type: "authChanges", changes: ["a", "b"] });
    relay.relay({ type: "unSaveLock", index: 2, syncChangesIndex: 3 });
    expect(editor.store.get().session).toEqual({ seen: 3, saved: 0, lastAuthor: "me" });
    expect(hasUnsavedChanges(editor.store.get())).toBe(true);

    const saved = await editor.save();
    relay.relay({ type: "saveChanges", changes: [], syncChangesIndex: 4 });
    editor.markSaved(saved);
    expect(relay.sent.at(-1)).toBe('{"type":"stapel:saved","index":3}');

    relay.relay({ type: "stapel:saved", index: 3 });
    expect(hasUnsavedChanges(editor.store.get())).toBe(true);
    relay.relay({ type: "stapel:saved", index: 4 });
    expect(hasUnsavedChanges(editor.store.get())).toBe(false);
  });

  it("turns on fast co-editing once the document is shown, as web-apps does", async () => {
    const { engine } = await openShared();
    expect(engine.api().calls).toEqual(
      expect.arrayContaining([
        ["asc_SetFastCollaborative", true],
        ["SetCollaborativeMarksShowType", 2],
        ["asc_setAutoSaveGap", 1],
      ]),
    );
  });
});

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
    expect(engine.window.io).toBeUndefined();
    expect(engine.api().docInfo).toMatchObject({
      Url: "_offline_",
      Title: "Angebot.docx",
      Format: "docx",
      Mode: "edit",
    });
  });

  it("opens read-only for someone who may only look", async () => {
    const engine = createFakeEngine();
    const opening = openWordDocument(engine.window, optionsWith(fakeConverter().convert, { mode: "view" }));
    await flush();
    engine.api().emit("asc_onDocumentContentReady");
    await opening;
    expect(engine.api().docInfo).toMatchObject({ Mode: "view", Permissions: { edit: false } });
    const names = engine.api().calls.map(([name]) => name);
    expect(names.indexOf("asc_setViewMode")).toBeGreaterThan(-1);
    expect(names.indexOf("asc_setViewMode")).toBeLessThan(names.indexOf("asc_LoadDocument"));
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

  it("gives the engine's input the keys when someone presses the mouse in the frame", async () => {
    const { engine } = await openReady();
    expect(engine.press()).toBe(1);
  });

  it("hands a right click on to whoever shows the menu", async () => {
    const { engine, editor } = await openReady();
    const requests: unknown[] = [];
    const stop = editor.onContextMenu((request) => requests.push(request));
    engine.api().emit("asc_onContextMenu", { get_Type: () => 0, get_X: () => 12, get_Y: () => 34 });
    stop();
    engine.api().emit("asc_onContextMenu", { get_Type: () => 0, get_X: () => 1, get_Y: () => 1 });
    expect(requests).toEqual([{ x: 12, y: 34, area: "body" }]);
  });

  it("opens our search on Strg+F instead of the browser's", async () => {
    const { engine, editor } = await openReady();
    const shortcuts: string[] = [];
    editor.onFindShortcut((shortcut) => shortcuts.push(shortcut));
    const event = new KeyboardEvent("keydown", { key: "h", ctrlKey: true, cancelable: true });
    engine.window.dispatchEvent(event);
    expect(shortcuts).toEqual(["replace"]);
    expect(event.defaultPrevented).toBe(true);
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
    expect(saved).toEqual({ bytes: savedDocx, seen: 0 });
    const conversion = converter.conversions.at(-1);
    expect(conversion).toMatchObject({ from: "bin", to: "docx" });
    expect(new TextDecoder().decode(conversion?.bytes)).toBe(engine.api().nativeFile);
  });

  it("reads the modified flag from the engine, since the event carries none", async () => {
    const { engine, editor } = await openReady();
    engine.api().modified = true;
    engine.api().emit("asc_onDocumentModifiedChanged");
    expect(editor.store.get().document.modified).toBe(true);

    editor.markSaved({ bytes: savedDocx, seen: 0 });
    expect(engine.api().calls).toContainEqual(["SetUnchangedDocument"]);
    expect(editor.store.get().document.modified).toBe(false);
  });

  it("reads the list at the cursor when the selection moves", async () => {
    const { engine, editor } = await openReady();
    engine.api().numbering = 5;
    engine.api().emit("asc_onFocusObject", [selected(0)]);
    expect(editor.store.get().paragraph.list).toBe("bullet");

    engine.api().numbering = 13;
    engine.api().emit("asc_onFocusObject", [selected(0)]);
    expect(editor.store.get().paragraph.list).toBe("number");

    engine.api().numbering = null;
    engine.api().emit("asc_onFocusObject", [selected(0)]);
    expect(editor.store.get().paragraph.list).toBeNull();
  });

  it("shows a list started from the toolbar once the engine has applied it", async () => {
    const { editor } = await openReady();
    await editor.commands.toggleList("number");
    expect(editor.store.get().paragraph.list).toBe("number");
    await editor.commands.toggleList("number");
    expect(editor.store.get().paragraph.list).toBeNull();
  });

  it("knows when the cursor is in a table", async () => {
    const { engine, editor } = await openReady();
    engine.api().emit("asc_onFocusObject", [selected(0), selected(1)]);
    expect(editor.store.get().paragraph.inTable).toBe(true);
    engine.api().emit("asc_onFocusObject", [selected(0)]);
    expect(editor.store.get().paragraph.inTable).toBe(false);
  });

  it("adds, answers, resolves and removes comments through the engine", async () => {
    const { engine, editor } = await openReady();
    const id = editor.comments.add("  Bitte prüfen ");
    expect(id).toBe("comment-1");
    expect(editor.store.get().comments).toMatchObject([
      { id, text: "Bitte prüfen", author: "Tristan", replies: [] },
    ]);

    editor.comments.reply("comment-1", "Mache ich");
    editor.comments.setResolved("comment-1", true);
    expect(editor.store.get().comments[0]).toMatchObject({
      resolved: true,
      replies: [{ text: "Mache ich", author: "Tristan" }],
    });

    engine.api().emit("asc_onShowComment", ["comment-1"]);
    expect(editor.store.get().activeComments).toEqual(["comment-1"]);

    editor.comments.remove("comment-1");
    expect(editor.store.get().comments).toEqual([]);
    expect(editor.store.get().activeComments).toEqual([]);
  });

  it("marks commented text once the document is shown", async () => {
    const { engine } = await openReady();
    expect(engine.api().calls).toContainEqual(["asc_showComments", false]);
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
