/** The Office formats the editors open and save. */
export type OfficeFormat = "docx" | "xlsx" | "pptx";

/** OpenDocument (LibreOffice): x2t reads and writes them, so they are edited and saved as they are. */
export type OpenDocumentFormat = "odt" | "ods" | "odp";

/** The editor's format and its OpenDocument counterpart. */
export const OPEN_DOCUMENT_FORMAT: Record<OfficeFormat, OpenDocumentFormat> = {
  docx: "odt",
  xlsx: "ods",
  pptx: "odp",
};

/**
 * Older formats x2t reads but does not write (Word 97–2003, RTF, Excel 97–2003, PowerPoint 97–2003);
 * they are converted into the Office format they belong to, and that copy is edited.
 */
export type LegacyFormat = "doc" | "rtf" | "xls" | "ppt";

export const OFFICE_FORMAT_OF_LEGACY: Record<LegacyFormat, OfficeFormat> = {
  doc: "docx",
  rtf: "docx",
  xls: "xlsx",
  ppt: "pptx",
};

/** Formats the converter moves between: Office files, CSV, and the engine's own binary format. */
export type ConvertFormat = OfficeFormat | OpenDocumentFormat | LegacyFormat | "csv" | "bin";

/** The images of a document by their file name in its "media" folder, e.g. "image1.png". */
export type MediaFiles = Record<string, Uint8Array>;

/** A converted document and its images: x2t takes them out of an Office file and puts them back. */
export type Converted = { bytes: Uint8Array; media: MediaFiles };

export type Convert = (
  bytes: Uint8Array,
  from: ConvertFormat,
  to: ConvertFormat,
  media?: MediaFiles,
  /** For a CSV file: its delimiter as x2t numbers it (csv.ts). */
  csvDelimiter?: number,
) => Promise<Converted>;

/** A font file the PDF embeds: its name in the engine's font folder and its bytes, decoded. */
export type FontFile = { name: string; bytes: Uint8Array };

/**
 * Turns a document into a PDF: its binary format, the engine's drawing commands for print, and the
 * fonts they use.
 */
export type RenderPdf = (
  document: Uint8Array,
  commands: Uint8Array,
  fonts: FontFile[],
  media?: MediaFiles,
  /** A PDF/A file (ISO 19005-2) for archiving, instead of a plain PDF. */
  pdfa?: boolean,
) => Promise<Uint8Array>;

/**
 * A PDF drawn anew as PDF/A, with the editor's changes written in first if there are any, and the
 * fonts to embed: x2t needs them, or its text comes out as outlines nobody can search.
 */
export type WritePdfA = (
  pdf: Uint8Array,
  changes: Uint8Array | null,
  fonts: FontFile[],
  media?: MediaFiles,
) => Promise<Uint8Array>;

/**
 * Writes the PDF editor's changes into the PDF they were made on: the original file, the change file
 * the editor's `Save()` returns (it starts with "%PDF"), and the images the changes refer to.
 */
export type ApplyPdfChanges = (
  original: Uint8Array,
  changes: Uint8Array,
  media?: MediaFiles,
) => Promise<Uint8Array>;

export type Converter = {
  convert: Convert;
  renderPdf: RenderPdf;
  applyPdfChanges: ApplyPdfChanges;
  writePdfA: WritePdfA;
  terminate: () => void;
};

type Reply = { id: number; bytes?: Uint8Array; media?: MediaFiles; error?: string };

export type WorkerLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<Reply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/** The converter worker (engine/frame/x2t/worker.js) below the engine root. */
export const converterPath = (enginePath = "/engine"): string =>
  `${enginePath.replace(/\/$/, "")}/frame/x2t/worker.js`;

/**
 * Converts with x2t in a worker (engine/frame/x2t/worker.js). The engine of this build cannot read
 * or write Office files itself — its OOXML reader is not part of Euro-Office — so every open and save
 * goes through x2t, as in CryptPad.
 */
export const createConverter = (
  createWorker: () => WorkerLike = () => new Worker(converterPath()) as unknown as WorkerLike,
): Converter => {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (converted: Converted) => void; reject: (error: Error) => void }
  >();

  const failAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker;
    const created = createWorker();
    created.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.bytes) request.resolve({ bytes: data.bytes, media: data.media ?? {} });
      else request.reject(new Error(data.error ?? "The converter returned nothing."));
    };
    created.onerror = (event) => {
      failAll(new Error(`The converter stopped: ${event.message}`));
      created.terminate();
      worker = null;
    };
    worker = created;
    return created;
  };

  const request = (bytes: Uint8Array, message: Record<string, unknown>, transfer: Transferable[] = []) =>
    new Promise<Converted>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      // A copy is sent, so the caller keeps its bytes (the open document stays usable).
      const copy = bytes.slice();
      ensureWorker().postMessage({ id, bytes: copy, ...message }, [copy.buffer, ...transfer]);
    });

  return {
    convert: (bytes, from, to, media = {}, csvDelimiter) =>
      request(bytes, { from, to, media, ...(csvDelimiter === undefined ? {} : { csvDelimiter }) }),
    renderPdf: async (document, commands, fonts, media = {}, pdfa = false) =>
      (await request(document, { from: "bin", to: "pdf", commands, fonts, media, ...(pdfa ? { pdfa } : {}) }))
        .bytes,
    writePdfA: async (pdf, changes, fonts, media = {}) => {
      const copy = changes?.slice();
      const message = {
        from: "pdf",
        to: "pdf",
        pdfa: true,
        fonts,
        media,
        ...(copy ? { changes: copy } : {}),
      };
      return (await request(pdf, message, copy ? [copy.buffer] : [])).bytes;
    },
    applyPdfChanges: async (original, changes, media = {}) => {
      const copy = changes.slice();
      return (await request(original, { from: "pdf", to: "pdf", changes: copy, media }, [copy.buffer])).bytes;
    },
    terminate: () => {
      failAll(new Error("The converter was closed."));
      worker?.terminate();
      worker = null;
    },
  };
};
