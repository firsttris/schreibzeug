/**
 * Where the app goes when it starts: back to where it was last, files on this computer or a
 * server, unless the menu asked for the choice (`?choose`). Pure, for main.ts and the tests.
 */
export type Place = { kind: "local" } | { kind: "server"; url: string };

/** What the page keeps of the last place: "local", or nothing for the newest server. */
export const LOCAL = "local";

export const placeToOpen = (
  last: string | null,
  recent: readonly string[],
  choose: boolean,
): Place | null => {
  if (choose) return null;
  if (last === LOCAL) return { kind: "local" };
  const [newest] = recent;
  return newest ? { kind: "server", url: newest } : null;
};
