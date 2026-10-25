/** Up to two letters for the avatar: "Anna Berger" → "AB". */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    // The first code point, not the first UTF-16 unit, which may be half a surrogate pair ("𝓐").
    .map((part) => [...part][0]?.toUpperCase() ?? "")
    .join("");
