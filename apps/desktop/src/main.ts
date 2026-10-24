import { readRecent, remember, serverUrl } from "./servers";

/** Where the page keeps the servers; the app's own origin, so it survives the window going elsewhere. */
const STORAGE_KEY = "stapel.servers";

const load = (): string[] => {
  try {
    return readRecent(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
};

const save = (servers: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  } catch {
    // Without storage the app still connects; it only asks again next time.
  }
};

/**
 * Whether a server answers at all. The server allows no other origin to read its answers, so this
 * only tells whether one came; the window then opens the server's own page.
 */
const reachable = (url: string): Promise<boolean> =>
  fetch(`${url}/api/health`, { mode: "no-cors", signal: AbortSignal.timeout(8000) }).then(
    () => true,
    () => false,
  );

const showError = (message: string | null) => {
  const error = document.getElementById("error");
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
  save(remember(load(), url));
  window.location.assign(url);
};

const showRecent = (servers: string[]) => {
  const list = document.getElementById("recent");
  if (!list) return;
  list.replaceChildren(
    ...servers.map((url) => {
      const item = document.createElement("li");
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: url });
      button.addEventListener("click", () => void connect(url));
      item.append(button);
      return item;
    }),
  );
};

const form = document.getElementById("connect") as HTMLFormElement | null;
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const typed = new FormData(form).get("server");
  const url = serverUrl(typeof typed === "string" ? typed : "");
  if (url) void connect(url);
  else showError("Das ist keine Web-Adresse.");
});

const servers = load();
showRecent(servers);
// Straight back to the last server, unless the menu asked to choose another ("Server wechseln").
const [last] = servers;
if (last && !new URLSearchParams(window.location.search).has("choose")) void connect(last);
