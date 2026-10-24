import { VALUES_FIELD } from "@schreibzeug/editor-core";
import { describe, expect, it } from "vitest";
import { targetsOf } from "./pivot-panel";

describe("where a pivot field may go", () => {
  it("is every other area for a field", () => {
    expect(targetsOf({ field: 1, name: "Kunde", area: "rows" })).toEqual(["filters", "columns", "values"]);
  });

  it("is rows or columns for the Werte entry", () => {
    expect(targetsOf({ field: VALUES_FIELD, name: "Werte", area: "columns" })).toEqual(["rows"]);
  });
});
