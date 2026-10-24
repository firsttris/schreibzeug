import { describe, expect, it } from "vitest";
import { completeUrl, createLinkCommands, type HyperlinkProps, type LinkApi } from "../src/links";

const HYPERLINK = 7;

/** A CHyperlinkProperty: plain fields behind its getters and setters. */
const props = (value: string | null = null, text: string | null = null) => {
  const fields: Record<string, string | null> = { value, text, bookmark: null };
  const object: HyperlinkProps & { fields: typeof fields } = {
    fields,
    get_Value: () => fields.value ?? null,
    get_Text: () => fields.text ?? null,
    put_Value: (url) => {
      fields.value = url;
    },
    put_Text: (next) => {
      fields.text = next;
    },
    put_Bookmark: (name) => {
      fields.bookmark = name;
    },
  };
  return object;
};

const engine = (selected: string | false, atCursor: ReturnType<typeof props> | null = null) => {
  const calls: Array<[string, Record<string, string | null>]> = [];
  const api: LinkApi = {
    can_AddHyperlink: () => selected,
    getSelectedElements: () =>
      atCursor ? [{ get_ObjectType: () => HYPERLINK, get_ObjectValue: () => atCursor }] : [],
    add_Hyperlink: (p) => calls.push(["add", { ...(p as ReturnType<typeof props>).fields }]),
    change_Hyperlink: (p) => calls.push(["change", { ...(p as ReturnType<typeof props>).fields }]),
    remove_Hyperlink: (p) => calls.push(["remove", { ...(p as ReturnType<typeof props>).fields }]),
  };
  return { calls, commands: createLinkCommands(api, () => props(), HYPERLINK) };
};

describe("links", () => {
  it("completes addresses as web-apps does", () => {
    expect(completeUrl(" example.org ")).toBe("http://example.org");
    expect(completeUrl("https://stapel.dev")).toBe("https://stapel.dev");
    expect(completeUrl("info@example.org")).toBe("mailto:info@example.org");
  });

  it("links the selected text and keeps its formatting", () => {
    const { calls, commands } = engine("Angebot");
    const draft = commands.draft();
    expect(draft?.link).toEqual({ url: "", text: "Angebot" });
    draft?.apply({ url: "example.org/angebot", text: "Angebot" });
    expect(calls).toEqual([["add", { value: "http://example.org/angebot", text: null, bookmark: null }]]);
  });

  it("writes the address where nothing is selected and no text is given", () => {
    const { calls, commands } = engine("");
    commands.draft()?.apply({ url: "stapel.dev", text: "" });
    expect(calls[0]?.[1].text).toBe("http://stapel.dev");
  });

  it("changes and removes the link at the cursor", () => {
    const link = props("http://alt.example", "Alt");
    const { calls, commands } = engine(false, link);
    const draft = commands.draft();
    expect(draft).toMatchObject({ existing: true, link: { url: "http://alt.example", text: "Alt" } });
    draft?.apply({ url: "https://neu.example", text: "Neu" });
    commands.remove();
    expect(calls.map(([name, fields]) => [name, fields.value, fields.text])).toEqual([
      ["change", "https://neu.example", "Neu"],
      ["remove", "https://neu.example", "Neu"],
    ]);
  });

  it("has no draft where no link can be", () => {
    expect(engine(false).commands.draft()).toBeNull();
  });
});
