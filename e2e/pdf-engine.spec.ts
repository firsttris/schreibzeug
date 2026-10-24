import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { degrees, PDFDocument } from "pdf-lib";
import { collectErrors } from "./app";

/**
 * The engine's contract for PDFs, below the app: the PDF editor opens a PDF from its bytes without
 * a Document Server, and x2t writes the editor's change file into the original. The editor-core
 * binding and the PDF view build on exactly these calls (pdf/api.js, pdf/src/viewer.js Save,
 * core X2tConverter/src/lib/pdf_image.h applyChangesPdf).
 */

const formular = [...readFileSync(join(import.meta.dirname, "../test-files/formular.pdf"))];

type Edit = "rotate" | "remove" | "fill";

/** Opens the PDF in the editor's host page, makes the edits and returns the saved PDF. */
const editPdf = async (page: import("@playwright/test").Page, bytes: number[], edits: Edit[]) => {
  await page.goto("/engine/frame/editor/pdf/main/index.html");
  const saved = await page.evaluate(
    async ({ bytes, edits }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the raw engine globals, below editor-core's types on purpose
      const win = window as unknown as Record<string, any>;
      const pdf = new Uint8Array(bytes);
      const api = new win.Asc.PDFEditorApi({ "id-view": "editor_sdk" });
      const ready = new Promise<void>((resolve, reject) => {
        api.asc_registerCallback("asc_onError", (id: number, level: number) => {
          if (level === -1) reject(new Error(`engine error ${id}`));
        });
        api.asc_registerCallback("asc_onGetEditorPermissions", () => api.asc_LoadDocument());
        api.asc_registerCallback("asc_onDocumentContentReady", resolve);
      });
      api._openChartOrLocalDocument = () => api.asc_openDocumentFromBytes(pdf);
      const info = new win.Asc.asc_CDocInfo();
      const user = new win.Asc.asc_CUserInfo();
      user.put_Id("test");
      user.put_FullName("Anna Berger");
      info.put_Id("pdf-engine");
      info.put_Url(win.AscCommon.offlineMode);
      info.put_Title("formular.pdf");
      info.put_Format("pdf");
      info.put_UserInfo(user);
      info.put_Permissions({ edit: true, download: true, print: true, comment: true });
      info.put_Mode("edit");
      api.asc_setDocInfo(info);
      api.asc_getEditorPermissions();
      await ready;

      const doc = api.getPDFDoc();
      if (edits.includes("rotate")) api.asc_RotatePage(90, [0]);
      if (edits.includes("remove")) api.asc_RemovePage([1]);
      if (edits.includes("fill")) {
        const field = doc.GetField("name");
        field.SetValue("Anna Berger");
        doc.CommitField(field);
      }
      const changes: Uint8Array = api.getDocumentRenderer().Save();

      const worker = new Worker("/engine/frame/x2t/worker.js");
      const reply = await new Promise<{ bytes?: Uint8Array; error?: string }>((resolve) => {
        worker.onmessage = ({ data }) => resolve(data);
        worker.postMessage({ id: 1, bytes: pdf, from: "pdf", to: "pdf", changes });
      });
      worker.terminate();
      if (!reply.bytes) throw new Error(reply.error);
      return {
        changesHead: String.fromCharCode(...changes.slice(0, 4)),
        bytes: [...reply.bytes],
      };
    },
    { bytes, edits },
  );
  return { changesHead: saved.changesHead, pdf: new Uint8Array(saved.bytes) };
};

test("the PDF editor opens a PDF and x2t writes its changes into the file", async ({ page }) => {
  const errors = collectErrors(page);
  const { changesHead, pdf } = await editPdf(page, formular, ["rotate", "remove", "fill"]);

  expect(changesHead).toBe("%PDF");
  const saved = await PDFDocument.load(pdf);
  expect(saved.getPageCount()).toBe(1);
  expect(saved.getPage(0).getRotation()).toEqual(degrees(90));
  expect(saved.getForm().getTextField("name").getText()).toBe("Anna Berger");
  expect(saved.getForm().getTextField("ort").getText() ?? "").toBe("");
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("a saved PDF opens again and takes further changes", async ({ page }) => {
  const first = await editPdf(page, formular, ["fill"]);
  const second = await editPdf(page, [...first.pdf], ["rotate"]);

  const saved = await PDFDocument.load(second.pdf);
  expect(saved.getPageCount()).toBe(2);
  expect(saved.getPage(0).getRotation()).toEqual(degrees(90));
  expect(saved.getForm().getTextField("name").getText()).toBe("Anna Berger");
});
