import { prefetchedEngineFiles, prefetchFiles } from "@schreibzeug/editor-core";
import { useEffect } from "react";
import { ENGINE_PATH } from "./engine";

/** The files this page has fetched already, so coming back to the file list fetches none again. */
const fetched = new Set<string>();

type PrefetchContext = {
  /** A build whose engine the browser keeps for good (engine-plugin.ts, apps/server/src/web.ts). */
  production: boolean;
  /** The files are on this computer (the desktop app, a local folder): nothing to wait for. */
  local: boolean;
  /** The browser asks for less data (Save-Data, navigator.connection.saveData). */
  saveData: boolean;
};

/**
 * Whether the file list loads the engine before a document asks for it. Only where the browser
 * keeps it (in development the engine is sent anew every time) and the bytes come over a network
 * that is not asked to be spared.
 */
export const shouldPrefetchEngine = ({ production, local, saveData }: PrefetchContext): boolean =>
  production && !local && !saveData;

const savesData = (): boolean =>
  (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;

/** Reads the file to its end without keeping it in memory: the browser's cache keeps it. */
const fetchToCache = async (url: string) => {
  const response = await fetch(url, { priority: "low" });
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  await response.body.pipeTo(new WritableStream());
  fetched.add(url);
};

/** Once the page has nothing else to do; Safari has no requestIdleCallback. */
const whenIdle = (run: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1000);
  return () => window.clearTimeout(id);
};

/**
 * Loads the engine while the file list is shown, so the first document opens without waiting for
 * it to download: on a phone over a mobile network that is most of the time to the first open
 * (docs/engine.md, "Opening fast, on a phone too"). Leaving the list lets the file on its way
 * finish and fetches no other, so the editor has the line to itself.
 */
export const usePrefetchEngine = (local: boolean): void => {
  useEffect(() => {
    if (!shouldPrefetchEngine({ production: import.meta.env.PROD, local, saveData: savesData() })) return;
    let stop = () => {};
    const cancel = whenIdle(() => {
      const missing = prefetchedEngineFiles(ENGINE_PATH).filter((url) => !fetched.has(url));
      stop = prefetchFiles(missing, fetchToCache).stop;
    });
    return () => {
      cancel();
      stop();
    };
  }, [local]);
};
