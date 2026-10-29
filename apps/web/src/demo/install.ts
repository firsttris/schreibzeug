/**
 * Turns the app into the demo before it starts (docs/development.md#the-demo): its requests to
 * /api, and the WebSocket of an editing session, go to the demo's server in the page (./api.ts)
 * instead of the network. The engine runs in the browser anyway; only the files and the relay
 * needed a server.
 */
import { m } from "../paraglide/messages";
import { createDemoApi } from "./api";
import { createMemoryFolder } from "./folder";
import { createMemoryMedia } from "./media";
import { seed } from "./samples";

const folder = createMemoryFolder();
const media = createMemoryMedia();
const api = createDemoApi({
  folder,
  media: media.store,
  rootName: m.context_my_files(),
  // The person the screenshots show (e2e/screenshots.shot.ts).
  user: { id: "demo", name: "Anna Berger" },
});

const networkFetch = window.fetch.bind(window);
await seed(folder, (url) => networkFetch(url));

/** The API's address, as main.tsx calls it: the origin, not the path the demo is served under. */
const apiPrefix = `${window.location.origin}/api/`;
const isApi = (url: string | URL) => new URL(url, window.location.href).href.startsWith(apiPrefix);

const demoFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  return isApi(request.url) ? api.fetch(request) : networkFetch(input, init);
};
// Whatever else the browser hangs on fetch stays.
window.fetch = Object.assign(demoFetch, window.fetch);

const NetworkWebSocket = window.WebSocket;
/** A WebSocket to /api is one to the page (collab.ts `joinSession`); any other goes out as before. */
// biome-ignore lint/complexity/useArrowFunction: `new WebSocket(…)` needs a function it can construct
const DemoWebSocket = function (url: string | URL, protocols?: string | string[]) {
  return isApi(String(url).replace(/^ws/, "http"))
    ? api.connect(String(url))
    : new NetworkWebSocket(url, protocols);
};
window.WebSocket = Object.assign(DemoWebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}) as unknown as typeof WebSocket;

/** Where an image added while editing is shown: a blob URL in the page (./media.ts). */
export const mediaUrl = (_fileId: string, name: string): string => media.urlOf(name);
