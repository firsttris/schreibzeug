import { initialPdfState, openPdfDocument } from "@schreibzeug/editor-core";
import type { SignatureCheck } from "@schreibzeug/pdf-sign";
import { useEffect, useRef, useState } from "react";
import { PdfToolbar } from "../toolbar/pdf-toolbar";
import { ContextMenu } from "../ui/context-menu";
import { clipboardHint } from "./common-menus";
import {
  DigitalSignatureDialog,
  loadPdfSign,
  SignatureNotice,
  type SigningRequest,
} from "./digital-signature";
import { DocumentArea } from "./document-area";
import { EditorHeader } from "./editor-header";
import { PDF_SHORTCUTS } from "./help-dialogs";
import { InvoiceCard, useEmbeddedInvoice } from "./invoice-card";
import { ScanNotice } from "./ocr-dialog";
import { downloadBytes, fileNameFor, MIME } from "./opened-file";
import { type PdfMenuContext, pagesLabel, pdfContextMenu, pdfMenus } from "./pdf-menus";
import type { EditorViewProps } from "./props";
import { SignatureDialog } from "./signature-dialog";
import { useCommentsPanel } from "./use-comments-panel";
import { useDocumentSave } from "./use-document-save";
import { useEditorChrome } from "./use-editor-chrome";
import { useEngineEditor } from "./use-engine-editor";
import { useOcr } from "./use-ocr";

/** A PDF: title and menus, the tools above, the engine's page thumbnails and the pages below. */
/** "%PDF" at the start: what PDF readers check before they read a file. */
const isPdf = (bytes: Uint8Array) =>
  bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

const baseName = (name: string) => name.replace(/\.pdf$/i, "");

/** Whether the file has a signature at all, before the signing code is loaded to check it. */
const mayBeSigned = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes).includes("/ByteRange");

/** The signatures the opened file holds, checked once it is open. */
const useSignatureChecks = (bytes: Uint8Array): SignatureCheck[] => {
  const [checks, setChecks] = useState<SignatureCheck[]>([]);
  useEffect(() => {
    setChecks([]);
    if (!mayBeSigned(bytes)) return;
    let current = true;
    void loadPdfSign().then(({ checkSignatures }) => {
      if (current) setChecks(checkSignatures(bytes));
    });
    return () => {
      current = false;
    };
  }, [bytes]);
  return checks;
};

export const PdfView = ({
  file,
  name,
  onSave,
  fileActions,
  onRename,
  onCreateFile,
  onReplace,
}: EditorViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const { editor, state, failure } = useEngineEditor(
    container,
    file,
    "pdf",
    openPdfDocument,
    initialPdfState,
  );
  const saving = useDocumentSave(editor, state, onSave, file.readOnly);
  const chrome = useEditorChrome(editor, container, name, file.readOnly, () => void saving.save());
  const comments = useCommentsPanel(editor, state, file.readOnly, "page");
  const [signing, setSigning] = useState(false);
  const signature = editor?.signature ?? null;
  const onSign = signature && !file.readOnly ? () => setSigning(true) : null;
  const appendInput = useRef<HTMLInputElement>(null);
  const checks = useSignatureChecks(file.bytes);
  const [signingDigitally, setSigningDigitally] = useState(false);
  const invoice = useEmbeddedInvoice(file.bytes);
  const ocr = useOcr({
    editor,
    bytes: file.bytes,
    readOnly: file.readOnly,
    onReplace,
    signed: checks.length > 0,
  });

  /** Signs what is saved now, stores it as the newest version and opens that (the edit page). */
  const signDigitally = async (request: SigningRequest): Promise<string | null> => {
    if (!editor || !onReplace) return "Das PDF kann hier nicht signiert werden.";
    if (checks.length > 0)
      return "Das PDF ist bereits digital signiert; eine zweite Signatur kann Schreibzeug noch nicht hinzufügen.";
    const { readIdentity, signPdf } = await loadPdfSign();
    const identity = await readIdentity(request.certificate, request.password);
    if (!identity.ok) return identity.error;
    try {
      const saved = await editor.save();
      const signed = await signPdf(saved.bytes, identity.value, {
        date: new Date(),
        ...(request.reason ? { reason: request.reason } : {}),
        ...(request.location ? { location: request.location } : {}),
      });
      if (!signed.ok) return signed.error;
      await onReplace(signed.value);
      return null;
    } catch (error) {
      return `Das signierte PDF konnte nicht gespeichert werden: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const appendPdf = async (picked: File) => {
    const bytes = new Uint8Array(await picked.arrayBuffer());
    if (!isPdf(bytes)) return chrome.notify(`„${picked.name}“ ist keine PDF-Datei.`);
    editor?.pages.append(bytes, "end");
  };
  const pages = editor?.pages;
  const extractPages =
    pages && onCreateFile
      ? async () => {
          const label = pagesLabel(pages.selected());
          try {
            const saved = await onCreateFile(`${baseName(name)} – ${label}.pdf`, pages.extract(), MIME.pdf);
            chrome.notify(`${label} als „${saved}“ gespeichert.`);
          } catch (error) {
            chrome.notify(
              `${label} konnten nicht gespeichert werden: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      : null;

  const download = async () => {
    if (editor) downloadBytes((await editor.save()).bytes, fileNameFor(name, "pdf"), MIME.pdf);
  };

  const context: PdfMenuContext = {
    state,
    commands: editor?.commands ?? null,
    pages: editor?.pages ?? null,
    view: editor?.view ?? null,
    onClipboardRefused: (action) => chrome.notify(clipboardHint(action)),
    onAddNote: comments.compose,
    onSign,
    onSignDigitally: onReplace && !file.readOnly ? () => setSigningDigitally(true) : null,
    onAppendPdf: () => appendInput.current?.click(),
    onExtractPages: extractPages,
    onRecognizeText: ocr.start,
    notify: chrome.notify,
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format="pdf"
        state={state}
        failure={failure}
        saving={saving}
        ready={editor !== null}
        readOnly={file.readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        pdf={chrome.pdf && { print: chrome.pdf.print, downloadPdfA: chrome.pdf.downloadPdfA }}
        menus={file.readOnly ? [] : pdfMenus(context)}
        shortcuts={PDF_SHORTCUTS}
        notice={chrome.notice}
        actions={comments.button}
        toolbar={
          <PdfToolbar
            state={state}
            commands={editor?.commands ?? null}
            pages={editor?.pages ?? null}
            onAddNote={comments.compose}
            onSign={onSign}
            notify={chrome.notify}
          />
        }
      />
      <SignatureNotice checks={checks} modified={state.document.modified} />
      {invoice && <InvoiceCard embedded={invoice} />}
      {ocr.scanned && <ScanNotice onRecognize={ocr.start} />}
      <div className="flex min-h-0 flex-1">
        <DocumentArea
          container={container}
          search={null}
          searchState={state.search}
          searchBar={chrome.searchBar}
          readOnly={file.readOnly}
        />
        {comments.panel}
      </div>
      <p
        data-testid="pdf-position"
        className="m-0 border-t border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted-foreground)]"
      >
        Seite {Math.min(state.currentPage + 1, Math.max(state.document.pages, 1))} von{" "}
        {Math.max(state.document.pages, 1)}
      </p>
      <input
        ref={appendInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-testid="append-pdf-input"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked) void appendPdf(picked);
        }}
      />
      {ocr.dialog}
      <DigitalSignatureDialog
        open={signingDigitally}
        onClose={() => setSigningDigitally(false)}
        onSign={signDigitally}
      />
      {signature && (
        <SignatureDialog open={signing} onClose={() => setSigning(false)} onInsert={signature.insert} />
      )}
      {chrome.menuAt && (
        <ContextMenu
          x={chrome.menuAt.x}
          y={chrome.menuAt.y}
          label="Kontextmenü"
          groups={pdfContextMenu(context, chrome.menuAt.area)}
          onClose={chrome.closeMenu}
        />
      )}
    </div>
  );
};
