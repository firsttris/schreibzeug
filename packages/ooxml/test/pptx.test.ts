import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { blankPptx, pptx } from "../src";

const part = (bytes: Uint8Array, path: string): string => {
  const data = unzipSync(bytes)[path];
  if (!data) throw new Error(`${path} missing`);
  return strFromU8(data);
};

describe("pptx", () => {
  it("writes a presentation with a master, four layouts, a theme and one title slide", () => {
    const blank = blankPptx();
    const parts = Object.keys(unzipSync(blank));
    expect(parts).toEqual(
      expect.arrayContaining([
        "ppt/presentation.xml",
        "ppt/slideMasters/slideMaster1.xml",
        "ppt/slideLayouts/slideLayout4.xml",
        "ppt/slides/slide1.xml",
        "ppt/theme/theme1.xml",
      ]),
    );
    expect(part(blank, "ppt/presentation.xml")).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    expect(part(blank, "ppt/slideLayouts/slideLayout1.xml")).toContain('<p:cSld name="Titelfolie">');
    expect(part(blank, "ppt/slides/_rels/slide1.xml.rels")).toContain("slideLayout1.xml");
  });

  it("puts titles and bullets into the placeholders of each slide", () => {
    const bytes = pptx([
      { layout: "title", title: "Quartal & Plan", subtitle: "Oktober" },
      { layout: "content", title: "Ziele", bullets: ["Eins", "Zwei"] },
    ]);
    expect(part(bytes, "ppt/slides/slide1.xml")).toContain("<a:t>Quartal &amp; Plan</a:t>");
    expect(part(bytes, "ppt/slides/slide2.xml")).toMatch(/<a:t>Eins<\/a:t>[\s\S]*<a:t>Zwei<\/a:t>/);
    expect(part(bytes, "ppt/presentation.xml")).toContain('<p:sldId id="257" r:id="rId7"/>');
    expect(part(bytes, "ppt/_rels/presentation.xml.rels")).toContain(
      'Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"',
    );
  });

  it("gives the same bytes for the same content", () => {
    expect(blankPptx()).toEqual(blankPptx());
  });
});
