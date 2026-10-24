import { stat } from "node:fs/promises";
import { fail, ok, type Result } from "@stapel/server/result";

/**
 * Deleting moves into the system's own trash, where it can be restored as from the file manager:
 * gio on Linux (GLib, what Nautilus and most desktops use), the Finder on macOS, the recycle bin on
 * Windows. The path goes in as an argument or variable, never into the command text.
 */
export type Command = { cmd: string[]; env?: Record<string, string> };

const WINDOWS_SCRIPT = [
  "Add-Type -AssemblyName Microsoft.VisualBasic",
  "$p = $env:STAPEL_TRASH_PATH",
  "if (Test-Path -LiteralPath $p -PathType Container) {",
  "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
  "} else {",
  "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
  "}",
].join("\n");

export const trashCommand = (platform: NodeJS.Platform, path: string): Command => {
  if (platform === "win32")
    return {
      cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT],
      env: { STAPEL_TRASH_PATH: path },
    };
  if (platform === "darwin")
    return {
      cmd: [
        "osascript",
        "-e",
        "on run argv",
        "-e",
        'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
        "-e",
        "end run",
        path,
      ],
    };
  return { cmd: ["gio", "trash", "--", path] };
};

const COULD_NOT = "Das konnte nicht in den Papierkorb verschoben werden.";

export type Run = (command: Command) => Promise<number>;

const runCommand: Run = async ({ cmd, env }) => {
  const child = Bun.spawn(cmd, { env: { ...process.env, ...env }, stdout: "ignore", stderr: "ignore" });
  return child.exited;
};

/** Succeeds only when the file is gone afterwards; nothing is ever deleted outright. */
export const createTrash =
  (platform: NodeJS.Platform = process.platform, run: Run = runCommand) =>
  async (path: string): Promise<Result<null>> => {
    const code = await run(trashCommand(platform, path)).catch(() => -1);
    const gone = !(await stat(path).catch(() => null));
    return code === 0 && gone ? ok(null) : fail("internal", COULD_NOT);
  };
