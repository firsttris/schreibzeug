/**
 * What one session may hold, and how the relay ends a connection. DocsCoServer keeps its change
 * log in a database; here it lives in the memory of the one server process every user shares, so
 * it has a ceiling.
 */

/**
 * The largest WebSocket message the server takes (main.ts). sdkjs splits its changes into messages
 * of about 1.5 MiB (common/docscoapi.js `websocketMaxPayloadSize`, 1572864) but always sends at
 * least one change, so a large one (a pasted table, a slide full of shapes) can go past that; JSON
 * escaping grows it further. Bun's default would be 16 MiB.
 */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

/**
 * How large one session's log may grow: far beyond a day of editing (a change is a few hundred
 * bytes), small enough that the server does not run out of memory.
 */
export const LOG_LIMITS = { changes: 100_000, bytes: 64 * 1024 * 1024 } as const;

/** How many bytes the changes of a log hold. */
export const bytesOf = (changes: ReadonlyArray<{ change: string }>): number =>
  changes.reduce((sum, { change }) => sum + change.length, 0);

/** Whether a log of these changes stays within LOG_LIMITS. */
export const withinLimits = (changes: ReadonlyArray<{ change: string }>): boolean =>
  changes.length <= LOG_LIMITS.changes && bytesOf(changes) <= LOG_LIMITS.bytes;

/**
 * WebSocket close codes in the private range, ours: what ended a connection. The collaboration and
 * the agent socket both use them.
 */
export const SOCKET_CLOSE = { badMessage: 4400, signedOut: 4401, revoked: 4403, notFound: 4404 } as const;

/** sdkjs's close codes (common/docscoapicommon.js c_oCloseCode) the relay hands an engine. */
export const ENGINE_CLOSE = { sessionAbsolute: 4003, accessDeny: 4004, drop: 4007 } as const;

/**
 * Ends an engine's connection for good, as DocsCoServer does: sdkjs disconnects and does not try
 * again (docscoapi.js `_onDrop`), shows the error for the code and stays in view mode with the
 * download still possible (apiBase.js `CoAuthoringApi.onDisconnect`).
 */
export const dropMessage = (code: number, description: string): Record<string, unknown> => ({
  type: "drop",
  code,
  description,
});
