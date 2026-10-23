# Collaboration

Several people edit the same file at once. Each editor keeps its own engine; what one person types
reaches the others as engine changes, through a relay in the Stapel server. There is no Document
Server: the relay speaks the part of its protocol that `sdkjs` needs, the way CryptPad runs the
same engine without one.

```
browser A: engine ──fake socket.io──▶ CollabChannel ──WebSocket /api/collab/:fileId──┐
                                                                                      ▼
browser B: engine ◀─fake socket.io─── CollabChannel ◀───────────────────── apps/server: hub ─▶ session
```

## Joining a session

1. The editor page opens a WebSocket to `/api/collab/:fileId` (`joinSession` in
   `packages/editor-core/src/collab.ts`).
2. The server answers with its own first message, `{"type":"stapel:session","baseVersion":n}`: the
   file version the session started from. The first person to open a file starts the session at
   the file's newest version; everyone after them gets the same version.
3. The page loads that version's bytes (`GET /api/files/:id/content?version=n`), converts them and
   starts the engine in online mode. The engine then authenticates and gets all changes made since
   the session started (`authChanges`), and replays them on top.

Everyone opens the same bytes and applies the same changes in the same order, so all copies agree.

## The engine side

`sdkjs` talks to the Document Server through socket.io (`common/docscoapi.js`). It takes the
socket.io client from `window.io` when that is a function (`common/editorscommon.js`
`getSocketIO`), so Stapel puts a stand-in there before the engine starts
(`packages/editor-core/src/frame-socket.ts`). The stand-in passes messages as JSON text through the
channel and fires `connect`, `disconnect` and `message` like socket.io would. Messages from the
relay are parsed with the frame's own `JSON`, because the engine checks values with `instanceof`.

To leave offline mode, the document info gets a real URL instead of `AscCommon.offlineMode`: a
blob URL of the converted document. The engine sends it in its open command, and the relay hands
it back in `documentOpen`, so each engine opens the copy it converted itself.

When the document is shown, the editor turns on fast co-editing as the web-apps editors do
(`Collaboration.jsx` `onDocumentReady`): `asc_SetFastCollaborative(true)`, no change marks
(`SetCollaborativeMarksShowType(None)`), and `asc_setAutoSaveGap(1)`, which makes the engine send
its changes about once a second. The document info carries co-editing mode `fast`.

## Messages

The relay (`apps/server/src/collab/session.ts`) answers the messages `sdkjs` sends, in the shape
`DocService/sources/DocsCoServer.js` uses:

| From the engine | The relay answers |
|---|---|
| (connect) | `license`: a valid license with edit rights. |
| `auth` | to the sender `authChanges` (the change log), `auth` (session id, participants, locks, index of the user) and `documentOpen`; to the others `connectState`. |
| `auth` with `sessionId` | a reconnect, see below. |
| `isSaveLock` | `saveLock: false`: the engine may send. |
| `saveChanges` | to the others `saveChanges` with the new changes; to the sender `unSaveLock` (or `savePartChanges` for a part of a longer save). `deleteIndex` drops changes a reconnected client sends again. |
| `getLock` | the lock to everyone. Text documents grant every lock (`_checkLockWord`). |
| `unLockDocument` | `releaseLock` to the others. |
| `cursor` | the cursor to the others. |
| (disconnect) | `connectState` to the others; the person's locks are released. |

The hub (`hub.ts`) keeps one session per file in memory and delivers the answers;
`routes.ts` does the WebSocket upgrade with Hono on Bun. Malformed messages close the socket with
code 4400, an unknown file with 4404.

## Losing the connection

The channel reconnects on its own, with a growing pause up to five seconds. While it is gone the
engine starts its `Disconnect` action and takes no edits (`common/apiBase.js`
`CoAuthoringApi.onDisconnect`); the editor's status line says "Verbindung unterbrochen" until the
action ends. The engine comes back with its old session id. The relay restores the session if
nobody else changed the document meanwhile (the last change by someone else is the one the client
last saw, `lastOtherSaveTime`); otherwise it answers with error 4004 and the document has to be
opened again. If the relay started a new session at another version, the channel tells the engine
the reconnect failed.

## Saving

Saving works as without collaboration: the editor converts its copy to .docx and stores it as a
new version. All copies hold the same content, so it does not matter who saves. The session itself
lives only in the server's memory and ends with the last person leaving; changes nobody saved are
gone then.

## Tests

`apps/server/test/collab.test.ts` covers the session functions and the hub,
`packages/editor-core/test` the channel and the socket stand-in. `e2e/collaboration.spec.ts` opens
the same file in two browser contexts: both type and see each other's text, and one loses its
connection, waits for it to come back and edits on.
