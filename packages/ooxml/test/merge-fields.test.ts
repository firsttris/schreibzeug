import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docx, paragraphXml, simplifyMergeFields, simplifyMergeFieldsIn } from "../src";

/** A merge field as Word writes it, with the formatting of its runs. */
const complex = (instruction: string, shown: string) =>
  `<w:r><w:rPr><w:b/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r><w:rPr><w:b/></w:rPr><w:t>${shown}</w:t></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end" w:dirty="true"/></w:r>`;

describe("simplifyMergeFields", () => {
  it("makes a complex MERGEFIELD a simple field with its instruction and result", () => {
    const xml = `<w:p><w:r><w:t xml:space="preserve">Ort: </w:t></w:r>${complex(" MERGEFIELD Ort \\* MERGEFORMAT ", "«Ort»")}</w:p>`;
    expect(simplifyMergeFieldsIn(xml)).toBe(
      `<w:p><w:r><w:t xml:space="preserve">Ort: </w:t></w:r><w:fldSimple w:instr=" MERGEFIELD Ort \\* MERGEFORMAT "><w:r><w:rPr><w:b/></w:rPr><w:t>«Ort»</w:t></w:r></w:fldSimple></w:p>`,
    );
  });

  it("joins an instruction Word split into several runs", () => {
    const xml =
      `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGE</w:instrText></w:r>` +
      `<w:r><w:instrText>FIELD "Straße &amp; Nr" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:t>x</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    expect(simplifyMergeFieldsIn(xml)).toContain(
      `<w:fldSimple w:instr=" MERGEFIELD &quot;Straße &amp; Nr&quot; ">`,
    );
  });

  it("leaves other fields, nested fields and fields across paragraphs as they are", () => {
    const page = `<w:p>${complex(" PAGE ", "1")}</w:p>`;
    expect(simplifyMergeFieldsIn(page)).toBe(page);
    const across = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGEFIELD A </w:instrText></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    expect(simplifyMergeFieldsIn(across)).toBe(across);
  });

  it("changes the package only where it has complex merge fields", () => {
    const plain = docx([paragraphXml([{ text: "Hallo" }])]);
    expect(simplifyMergeFields(plain)).toBe(plain);
    const letter = docx([`<w:p>${complex(" MERGEFIELD Name ", "«Name»")}</w:p>`]);
    const xml = strFromU8(unzipSync(simplifyMergeFields(letter))["word/document.xml"] ?? new Uint8Array());
    expect(xml).toContain('<w:fldSimple w:instr=" MERGEFIELD Name ">');
    expect(xml).not.toContain("fldChar");
  });
});
