/*
 * Converts documents with x2t: ONLYOFFICE core compiled to WebAssembly (cryptpad/onlyoffice-x2t-wasm),
 * served from ../../x2t/. The engine opens and saves its own binary format ("DOCY"); x2t turns a
 * .docx into that format and back. It runs in a worker so its large heap stays out of the page and
 * can be released by terminating the worker.
 *
 * Message in:  { id, bytes: Uint8Array, from: "docx" | "bin", to: "bin" | "docx", media: { name: bytes } }
 *              or, for a PDF, { id, bytes, from: "bin", to: "pdf", media, commands: Uint8Array, fonts: [{ name, bytes }] }
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
const taskXml = (from, to, fontDir) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
  `<m_sFileFrom>${from}</m_sFileFrom>` +
  `<m_sFileTo>${to}</m_sFileTo>` +
  "<m_bIsNoBase64>true</m_bIsNoBase64>" +
  (fontDir ? `<m_sFontDir>${fontDir}/</m_sFontDir>` : "") +
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

const convert = (x2t, id, bytes, from, to, media, commands, fonts) => {
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
    x2t.FS.writeFile(input, bytes);
    x2t.FS.writeFile(task, taskXml(input, output, fontDir));
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
  const { id, bytes, from, to, media, commands, fonts } = event.data;
  try {
    const x2t = await loadX2t();
    const result = convert(x2t, id, bytes, from, to, media, commands, fonts);
    const transfer = [result.bytes.buffer, ...Object.values(result.media).map((image) => image.buffer)];
    self.postMessage({ id, ...result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
