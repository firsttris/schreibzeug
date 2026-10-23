/*
 * Converts documents with x2t: ONLYOFFICE core compiled to WebAssembly (cryptpad/onlyoffice-x2t-wasm),
 * served from ../../x2t/. The engine opens and saves its own binary format ("DOCY"); x2t turns a
 * .docx into that format and back. It runs in a worker so its large heap stays out of the page and
 * can be released by terminating the worker.
 *
 * Message in:  { id, bytes: Uint8Array, from: "docx" | "bin", to: "bin" | "docx" }
 * Message out: { id, bytes: Uint8Array } or { id, error: string }
 */
"use strict";

let x2tReady = null;

const x2tUrl = (file) => new URL(`../../x2t/${file}`, self.location.href).href;

const loadX2t = () => {
  x2tReady ??= new Promise((resolve, reject) => {
    self.Module = {
      locateFile: (file) => x2tUrl(file),
      onRuntimeInitialized: () => resolve(self.Module),
      onAbort: (reason) => reject(new Error(`x2t aborted: ${reason}`)),
      print: () => {},
      printErr: (text) => console.warn("[x2t]", text),
    };
    try {
      importScripts(x2tUrl("x2t.js"));
    } catch (error) {
      reject(error);
    }
  });
  return x2tReady;
};

// The task format x2t reads (core: TaskQueueDataConvert). No base64: the binary format is written
// as bytes with its "DOCY;v10;<size>;" header.
const taskXml = (from, to) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
  `<m_sFileFrom>${from}</m_sFileFrom>` +
  `<m_sFileTo>${to}</m_sFileTo>` +
  "<m_bIsNoBase64>true</m_bIsNoBase64>" +
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

const convert = (x2t, id, bytes, from, to) => {
  const dir = `/job-${id}`;
  const input = `${dir}/input.${from}`;
  const output = `${dir}/output.${to}`;
  const task = `${dir}/task.xml`;
  x2t.FS.mkdir(dir);
  try {
    x2t.FS.writeFile(input, bytes);
    x2t.FS.writeFile(task, taskXml(input, output));
    const code = x2t.ccall("main1", "number", ["string"], [task]);
    if (code !== 0) throw new Error(`x2t could not convert ${from} to ${to} (code ${code})`);
    return x2t.FS.readFile(output);
  } finally {
    removeTree(x2t.FS, dir);
  }
};

self.onmessage = async (event) => {
  const { id, bytes, from, to } = event.data;
  try {
    const x2t = await loadX2t();
    const result = convert(x2t, id, bytes, from, to);
    self.postMessage({ id, bytes: result }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
