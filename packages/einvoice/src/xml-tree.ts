/** Reading the tree fast-xml-parser makes, with the namespace prefixes removed. */

type Node = Record<string, unknown>;

/** Every node at the path; a path step may meet one node or an array of them. */
export const all = (node: unknown, ...path: string[]): unknown[] => {
  let current: unknown[] = [node];
  for (const key of path) {
    current = current.flatMap((n) => {
      if (!n || typeof n !== "object" || Array.isArray(n)) return [];
      const value = (n as Node)[key];
      if (value === undefined) return [];
      return Array.isArray(value) ? value : [value];
    });
  }
  return current;
};

export const one = (node: unknown, ...path: string[]): unknown => all(node, ...path)[0];

/** The first path that finds something (ZUGFeRD 1.0 names its elements differently). */
export const first = (node: unknown, ...paths: string[][]): unknown => {
  for (const path of paths) {
    const found = one(node, ...path);
    if (found !== undefined) return found;
  }
  return undefined;
};

export const text = (node: unknown): string | undefined => {
  const value = node && typeof node === "object" ? (node as Node)["#text"] : node;
  if (value === undefined || value === null || typeof value === "object") return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

export const attribute = (node: unknown, name: string): string | undefined =>
  node && typeof node === "object" ? text((node as Node)[`@_${name}`]) : undefined;

export const textAt = (node: unknown, ...path: string[]): string | undefined => {
  for (const found of all(node, ...path)) {
    const value = text(found);
    if (value !== undefined) return value;
  }
  return undefined;
};
