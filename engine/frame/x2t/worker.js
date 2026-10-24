/*
 * Converts documents with x2t: ONLYOFFICE core compiled to WebAssembly (cryptpad/onlyoffice-x2t-wasm),
 * served from ../../x2t/. The engine opens and saves its own binary format ("DOCY"); x2t turns a
 * .docx into that format and back. It runs in a worker so its large heap stays out of the page and
 * can be released by terminating the worker.
 *
 * Message in:  { id, bytes: Uint8Array, from: "docx" | "bin", to: "bin" | "docx", media: { name: bytes } }
 *              from a CSV file (to "xlsx") also { csvDelimiter: number } (common/commonDefines.js c_oAscCsvDelimiter)
 *              or, for a PDF, { id, bytes, from: "bin", to: "pdf", media, commands: Uint8Array, fonts: [{ name, bytes }] }
 *              or, for an edited PDF, { id, bytes: the original PDF, from: "pdf", to: "pdf", media, changes: Uint8Array }
 *              and, for PDF/A, pdfa: true with either (and with from "pdf" and no changes: a PDF drawn anew as PDF/A)
 * Message out: { id, bytes: Uint8Array, media: { name: bytes } } or { id, error: string }
 *
 * The images of a document travel beside it: x2t writes them to "media/" next to the binary it
 * makes, and reads them from there when it writes an Office file or a PDF (as CryptPad does,
 * www/common/outer/x2t.js).
 */
"use strict";

let x2tReady = null;

// What x2t writes to stderr during the current conversion, for the error message.
let stderr = [];

const x2tUrl = (file) => new URL(`../../x2t/${file}`, self.location.href).href;

// The module is fetched here rather than by the emscripten glue, so a missing or wrong file fails
// with its URL and status instead of a bare "expected magic word" from WebAssembly.
const fetchWasm = async () => {
  const url = x2tUrl("x2t.wasm");
  const response = await fetch(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isWasm = bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
  if (!response.ok || !isWasm) {
    throw new Error(
      `x2t.wasm could not be loaded from ${url} (${response.status} ${response.headers.get("content-type")})`,
    );
  }
  return bytes.buffer;
};

const loadX2t = () => {
  x2tReady ??= fetchWasm().then(
    (wasmBinary) =>
      new Promise((resolve, reject) => {
        self.Module = {
          wasmBinary,
          locateFile: (file) => x2tUrl(file),
          onRuntimeInitialized: () => resolve(self.Module),
          onAbort: (reason) => reject(new Error(`x2t aborted: ${reason}`)),
          print: () => {},
          printErr: (text) => {
            stderr.push(text);
            console.warn("[x2t]", text);
          },
        };
        importScripts(x2tUrl("x2t.js"));
      }),
  );
  // A failed load is not cached, so the next conversion tries again.
  x2tReady.catch(() => {
    x2tReady = null;
  });
  return x2tReady;
};

// The task format x2t reads (core: TaskQueueDataConvert). No base64: the binary format is written
// as bytes with its "DOCY;v10;<size>;" header. For a PDF, x2t reads the engine's drawing commands
// from "pdf.bin" next to the document and embeds fonts from the font folder, as CryptPad converts
// it (www/common/outer/x2t.js x2tConvertDataInternal).
// x2t reads a CSV (writing one is left to the page: x2t's CSV writer encodes text through ICU, which
// the WebAssembly build has no converter data for, so every character past ASCII came out as one
// byte; core OOXML/Binary/Sheets/Writer/CSVWriter.cpp WriteFile, UnicodeConverter.cpp fromUnicode).
// It wants both formats of the task, or it takes the direction as unknown and answers
// AVS_FILEUTILS_ERROR_CONVERT_NEED_PARAMS, 89 (core X2tConverter/src/cextracttools.h
// getConversionDirection, ASCConverters.cpp fromInputParams). The ids are core's
// Common/OfficeFileFormats.h, as CryptPad lists them (www/common/outer/x2t.js getFormatId). The
// text is UTF-8 (46: sdkjs common/commonDefines.js c_oAscCodePageUtf8, which CSVReader.cpp decodes
// itself), the delimiter c_oAscCsvDelimiter, and numbers and dates are read as German ones
// (m_nLcid 1031, CSVReader.cpp CellFormatController): "-4,20" and "01.10.2026".
const FORMAT_IDS = { csv: 260, xlsx: 257 };
const UTF8 = 46;
const GERMAN_LCID = 1031;
const csvXml = (from, to, delimiter) =>
  from === "csv"
    ? `<m_nFormatFrom>${FORMAT_IDS.csv}</m_nFormatFrom>` +
      `<m_nFormatTo>${FORMAT_IDS[to]}</m_nFormatTo>` +
      `<m_nCsvTxtEncoding>${UTF8}</m_nCsvTxtEncoding>` +
      `<m_nCsvDelimiter>${delimiter}</m_nCsvDelimiter>` +
      `<m_nLcid>${GERMAN_LCID}</m_nLcid>`
    : "";

// An edited PDF: the original with the PDF editor's change file in "changes/" beside it. x2t applies
// the change file to the original (core X2tConverter/src/lib/pdf_image.h fromCrossPlatform →
// applyChangesPdf → applyCompiledChangesPdf: a file that starts with "%PDF" is written straight into
// the PDF, without the document renderer). 513 is AVS_OFFICESTUDIO_FILE_CROSSPLATFORM_PDF
// (Common/OfficeFileFormats.h).
const PDF_FORMAT_ID = 513;
// PDF/A: x2t writes the PDF as PDF/A (core X2tConverter/src/cextracttools.h m_bIsPDFA →
// PdfFile CreatePdf(isPDFA)); a PDF is drawn anew into one instead of being copied
// (pdf_image.h fromCrossPlatform: nFormatFrom == nFormatTo && !getIsPDFA()).
const pdfaXml = (pdfa) => (pdfa ? "<m_bIsPDFA>true</m_bIsPDFA>" : "");

const pdfFormatsXml = (tempDir) =>
  `<m_nFormatFrom>${PDF_FORMAT_ID}</m_nFormatFrom>` +
  `<m_nFormatTo>${PDF_FORMAT_ID}</m_nFormatTo>` +
  `<m_sTempDir>${tempDir}</m_sTempDir>`;
const pdfChangesXml = (changes, tempDir) =>
  changes ? `${pdfFormatsXml(tempDir)}<m_bFromChanges>true</m_bFromChanges>` : "";

const taskXml = (from, to, fontDir, extra) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
  `<m_sFileFrom>${from}</m_sFileFrom>` +
  `<m_sFileTo>${to}</m_sFileTo>` +
  "<m_bIsNoBase64>true</m_bIsNoBase64>" +
  (fontDir ? `<m_sFontDir>${fontDir}/</m_sFontDir>` : "") +
  extra +
  "</TaskQueueDataConvert>";

const removeTree = (fs, path) => {
  for (const name of fs.readdir(path)) {
    if (name === "." || name === "..") continue;
    const child = `${path}/${name}`;
    if (fs.isDir(fs.stat(child).mode)) removeTree(fs, child);
    else fs.unlink(child);
  }
  fs.rmdir(path);
};

const readMedia = (fs, dir) => {
  const media = {};
  if (!fs.analyzePath(dir).exists) return media;
  for (const name of fs.readdir(dir)) {
    if (name !== "." && name !== "..") media[name] = fs.readFile(`${dir}/${name}`);
  }
  return media;
};

const convert = (x2t, id, bytes, from, to, media, commands, fonts, csvDelimiter, changes, pdfa) => {
  const dir = `/job-${id}`;
  const input = `${dir}/input.${from}`;
  const output = `${dir}/output.${to}`;
  const task = `${dir}/task.xml`;
  const fontDir = fonts ? `${dir}/fonts` : null;
  x2t.FS.mkdir(dir);
  try {
    if (fontDir) {
      x2t.FS.mkdir(fontDir);
      for (const font of fonts) x2t.FS.writeFile(`${fontDir}/${font.name}.ttf`, font.bytes);
    }
    if (commands) x2t.FS.writeFile(`${dir}/pdf.bin`, commands);
    x2t.FS.mkdir(`${dir}/media`);
    for (const [name, image] of Object.entries(media ?? {})) x2t.FS.writeFile(`${dir}/media/${name}`, image);
    if (changes || (pdfa && from === "pdf")) x2t.FS.mkdir(`${dir}/temp`);
    if (changes) {
      x2t.FS.mkdir(`${dir}/changes`);
      x2t.FS.writeFile(`${dir}/changes/changes0.bin`, changes);
    }
    x2t.FS.writeFile(input, bytes);
    const extra =
      csvXml(from, to, csvDelimiter) +
      pdfChangesXml(changes, `${dir}/temp`) +
      pdfaXml(pdfa) +
      (pdfa && from === "pdf" && !changes ? pdfFormatsXml(`${dir}/temp`) : "");
    x2t.FS.writeFile(task, taskXml(input, output, fontDir, extra));
    stderr = [];
    const code = x2t.ccall("main1", "number", ["string"], [task]);
    if (code !== 0) {
      const details = stderr.length > 0 ? `: ${stderr.join(" ").slice(0, 500)}` : "";
      throw new Error(`x2t could not convert ${from} to ${to} (code ${code})${details}`);
    }
    return { bytes: x2t.FS.readFile(output), media: to === "bin" ? readMedia(x2t.FS, `${dir}/media`) : {} };
  } finally {
    removeTree(x2t.FS, dir);
  }
};

self.onmessage = async (event) => {
  const { id, bytes, from, to, media, commands, fonts, csvDelimiter, changes, pdfa } = event.data;
  try {
    const x2t = await loadX2t();
    const result = convert(x2t, id, bytes, from, to, media, commands, fonts, csvDelimiter, changes, pdfa);
    const transfer = [result.bytes.buffer, ...Object.values(result.media).map((image) => image.buffer)];
    self.postMessage({ id, ...result }, transfer);
  } catch (error) {
    // A C++ exception in x2t arrives as a bare number (a pointer); what x2t wrote to stderr says more.
    const message = error instanceof Error ? error.message : `x2t stopped (${String(error)})`;
    const details = stderr.length > 0 && !message.includes(stderr[0]) ? `: ${stderr.join(" ").slice(0, 500)}` : "";
    self.postMessage({ id, error: `${message}${details}` });
  }
};
