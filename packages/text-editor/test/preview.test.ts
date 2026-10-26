import { describe, expect, it } from "vitest";
import { markdownHtml, safeUrl } from "../src/preview";

describe("the split view's preview", () => {
  it("renders headings, emphasis, lists and tasks", () => {
    const html = markdownHtml("# Titel\n\nEin **fettes** und *kursives* `Wort`.\n\n- eins\n- [x] erledigt\n");
    expect(html).toContain("<h1>Titel</h1>");
    expect(html).toContain("<p>Ein <strong>fettes</strong> und <em>kursives</em> <code>Wort</code>.</p>");
    expect(html).toContain("<li><p>eins</p></li>");
    expect(html).toContain('<li class="task"><input type="checkbox" disabled checked> erledigt</li>');
  });

  it("renders tables, quotes, code and rules", () => {
    const html = markdownHtml(
      "| Halle | Regale |\n| --- | --- |\n| A | 42 |\n\n> Zitat\n\n```\nlet a = 1 < 2;\n```\n\n---",
    );
    expect(html).toContain("<thead><tr><th>Halle</th><th>Regale</th></tr></thead>");
    expect(html).toContain("<tbody><tr><td>A</td><td>42</td></tr></tbody>");
    expect(html).toContain("<blockquote><p>Zitat</p></blockquote>");
    expect(html).toContain("<pre><code>let a = 1 &#60; 2;</code></pre>");
    expect(html).toContain("<hr>");
  });

  it("links only to addresses that are safe, and shows raw HTML as text", () => {
    expect(markdownHtml("[gut](https://example.org)")).toContain('<a href="https://example.org"');
    expect(markdownHtml("[böse](javascript:alert(1))")).toBe("<p>böse</p>");
    expect(markdownHtml("<script>alert(1)</script>")).not.toContain("<script>");
    expect(markdownHtml('Ein <img src=x onerror="alert(1)"> Bild')).not.toContain("<img");
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("bilder/plan.png")).toBe("bilder/plan.png");
  });

  it("keeps a bare address GFM links on its own", () => {
    expect(markdownHtml("Siehe https://example.org dort")).toContain(
      '<a href="https://example.org" target="_blank" rel="noopener noreferrer">https://example.org</a>',
    );
  });

  it("keeps an image's text in its alt attribute as plain text, with nothing that could close it", () => {
    const html = markdownHtml("![<https://e.com/x/onerror=alert(1)//>](nope.png)");
    const image = new DOMParser().parseFromString(html, "text/html").querySelector("img");
    expect(image?.getAttributeNames().sort()).toEqual(["alt", "src"]);
    expect(image?.getAttribute("alt")).toBe("https://e.com/x/onerror=alert(1)//");
  });

  it("links to the target after the text, also when the text holds an address", () => {
    expect(markdownHtml("[see https://a.com](https://b.com)")).toBe(
      '<p><a href="https://b.com" target="_blank" rel="noopener noreferrer">see https://a.com</a></p>',
    );
    expect(markdownHtml("![a https://x.com/p](x.png)")).toBe(
      '<p><img src="x.png" alt="a https://x.com/p"></p>',
    );
  });
});
