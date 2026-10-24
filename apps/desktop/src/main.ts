import { invoke } from "@tauri-apps/api/core";
import { readRecent, remember, serverUrl } from "./servers";
import { LOCAL, placeToOpen } from "./start";

/** Where the page keeps the servers; the app's own origin, so it survives the window going elsewhere. */
const STORAGE_KEY = "schreibzeug.servers";
/** Where it went last: "local" for files on this computer, else a server. */
const LAST_KEY = "schreibzeug.last";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the app still works; it only asks again next time.
  }
};

const load = (): string[] => readRecent(read(STORAGE_KEY));

/** The app's own commands (src-tauri/src/lib.rs); absent when the page runs in a plain browser. */
const inApp = "__TAURI_INTERNALS__" in window;

/**
 * Whether a server answers at all. The server allows no other origin to read its answers, so this
 * only tells whether one came; the window then opens the server's own page.
 */
const reachable = (url: string): Promise<boolean> =>
  fetch(`${url}/api/health`, { mode: "no-cors", signal: AbortSignal.timeout(8000) }).then(
    () => true,
    () => false,
  );

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const showError = (message: string | null) => {
  const error = element("error");
  if (!error) return;
  error.textContent = message ?? "";
  error.hidden = message === null;
};

const connect = async (url: string) => {
  showError(null);
  if (!(await reachable(url))) {
    showError(`Unter ${url} antwortet kein Server.`);
    return;
  }
  write(STORAGE_KEY, JSON.stringify(remember(load(), url)));
  write(LAST_KEY, url);
  window.location.assign(url);
};

/** Starts the local server if needed and opens the files on this computer. */
const openLocal = async () => {
  showError(null);
  try {
    const url = await invoke<string>("open_local");
    write(LAST_KEY, LOCAL);
    window.location.assign(url);
  } catch (error) {
    showError(`Die Dateien auf diesem Computer lassen sich nicht öffnen: ${String(error)}`);
  }
};

const showFolder = async () => {
  const folder = element("folder");
  if (folder) folder.textContent = await invoke<string>("local_folder").catch(() => "Dokumente");
};

const showRecent = (servers: string[]) => {
  element("recent")?.replaceChildren(
    ...servers.map((url) => {
      const item = document.createElement("li");
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: url });
      button.addEventListener("click", () => void connect(url));
      item.append(button);
      return item;
    }),
  );
};

const form = element<HTMLFormElement>("connect");
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const typed = new FormData(form).get("server");
  const url = serverUrl(typeof typed === "string" ? typed : "");
  if (url) void connect(url);
  else showError("Das ist keine Web-Adresse.");
});

if (inApp) {
  const local = element("local");
  if (local) local.hidden = false;
  void showFolder();
  element("open-local")?.addEventListener("click", () => void openLocal());
  element("change-folder")?.addEventListener("click", () => {
    void invoke<string | null>("choose_folder").then((folder) => {
      if (folder) void showFolder();
    });
  });
}

const servers = load();
showRecent(servers);
const query = new URLSearchParams(window.location.search);
showError(query.get("error"));
// Straight back to where it was last, unless the menu asked for the choice.
const place = placeToOpen(read(LAST_KEY), servers, query.has("choose"));
if (place?.kind === "local" && inApp) void openLocal();
if (place?.kind === "server") void connect(place.url);
