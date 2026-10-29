import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareLocales, findTexts, type Messages, messageKeys, sourceFiles, usedKeys } from "./i18n-check";

const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");
const messages = (locale: string): Messages => JSON.parse(read(`messages/${locale}.json`));
const settings = JSON.parse(read("project.inlang/settings.json")) as {
  baseLocale: string;
  locales: string[];
};
const files = sourceFiles(join(import.meta.dirname, "src"));

describe("the interface texts", () => {
  const base = messages(settings.baseLocale);

  it.each(settings.locales.filter((locale) => locale !== settings.baseLocale))(
    "are all translated to %s, with the same placeholders",
    (locale) => {
      expect(compareLocales(base, messages(locale), locale)).toEqual([]);
    },
  );

  it("are all used", () => {
    const used = usedKeys(files.map((file) => readFileSync(file, "utf8")));
    expect(messageKeys(base).filter((key) => !used.has(key))).toEqual([]);
  });

  it("are not written in the code", () => {
    const findings = files.flatMap((file) =>
      findTexts(file.slice(import.meta.dirname.length + 1), readFileSync(file, "utf8")),
    );
    expect(findings.map(({ file, line, text }) => `${file}:${line} ${text}`)).toEqual([]);
  });
});

describe("compareLocales", () => {
  it("names missing, extra, empty and mismatched messages", () => {
    const de = { a: "Datei {name}", b: "Ordner", c: "" };
    const en = { a: "File {title}", d: "Extra", c: "x" };
    expect(compareLocales(de, en, "en")).toEqual([
      "a: other placeholders in en",
      "b: missing in en",
      "d: only in en",
      "c: empty",
    ]);
  });
});

describe("findTexts", () => {
  const find = (source: string) => findTexts("x.tsx", source).map(({ text }) => text);

  it("finds JSX text, labels and German literals", () => {
    expect(find(`const a = <p title="Hallo Welt">Ein Text</p>;`)).toEqual(["Hallo Welt", "Ein Text"]);
    expect(find(`const items = [{ label: "Copy" }];`)).toEqual(["Copy"]);
    expect(find(`notice("Gespeichert, aber nicht hochgeladen");`)).toEqual([
      "Gespeichert, aber nicht hochgeladen",
    ]);
  });

  it("leaves messages, code values and marked literals alone", () => {
    expect(find(`const a = <p className="flex gap-2" title={m.title()}>{m.text()}</p>;`)).toEqual([]);
    expect(find(`const style = "Heading 1";`)).toEqual([]);
    expect(find(`// i18n-ignore: the engine reads it\nconst caption = "Gesamtergebnis";`)).toEqual([]);
  });
});
