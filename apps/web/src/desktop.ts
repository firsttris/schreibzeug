/**
 * The desktop app's commands, which its menu bar held (apps/desktop src-tauri/src/lib.rs). The app
 * marks every page it shows with `window.schreibzeugDesktop`; a command is a navigation to an
 * address the app catches before it loads, so no page needs native calls for it.
 */

export type DesktopCommand = "work-locally" | "choose-folder" | "choose-server";

/** Whether this page runs in the desktop app's window. */
export const inDesktopApp = (): boolean =>
  (window as { schreibzeugDesktop?: unknown }).schreibzeugDesktop === true;

/** The address that asks the app for the command (lib.rs ACTION_HOST); .invalid never loads. */
export const desktopCommandUrl = (command: DesktopCommand): string =>
  `https://desktop.schreibzeug.invalid/${command}`;

export const runDesktopCommand = (command: DesktopCommand): void =>
  window.location.assign(desktopCommandUrl(command));
