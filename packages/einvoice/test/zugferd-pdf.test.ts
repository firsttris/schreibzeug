import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractEmbeddedXml, facturXml, readEmbeddedInvoice, zugferdPdf, zugferdXmp } from "../src";
import { sampleDraft } from "./sample-draft";

/** A PDF that says it is PDF/A-2A, as the converter writes one (x2t's XMP, shortened). */
const pdfA2 = async (xmp = "<pdfaid:part>2</pdfaid:part><pdfaid:conformance>A</pdfaid:conformance>") => {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage();
  const packet = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>2026-10-25T03:39:43+00:00</xmp:CreateDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">${xmp}</rdf:Description></rdf:RDF></x:xmpmeta>`;
  const stream = document.context.flateStream(new TextEncoder().encode(packet), {
    Type: "Metadata",
    Subtype: "XML",
  });
  document.catalog.set(PDFName.of("Metadata"), document.context.register(stream));
  return document.save();
};

const NOW = new Date("2026-10-25T04:00:00.500Z");

const made = async () => {
  const xml = facturXml(sampleDraft());
  const result = await zugferdPdf(await pdfA2(), xml, NOW);
  if (!result.ok) throw new Error(result.error);
  return {
    xml,
    pdf: result.value,
    document: await PDFDocument.load(result.value, { updateMetadata: false }),
  };
};

const rawStream = (object: unknown): PDFRawStream => {
  if (!(object instanceof PDFRawStream)) throw new Error("not a stream");
  return object;
};

const metadata = (document: PDFDocument) => {
  const stream = rawStream(document.catalog.lookup(PDFName.of("Metadata")));
  return { stream, text: new TextDecoder().decode(stream.contents) };
};

describe("zugferdPdf", () => {
  it("attaches the invoice as factur-x.xml, as its alternative form", async () => {
    const { xml, pdf, document } = await made();
    expect(await extractEmbeddedXml(pdf)).toEqual({ filename: "factur-x.xml", xml });
    expect(await readEmbeddedInvoice(pdf)).toMatchObject({
      invoice: { ok: true, value: { number: "RE-2026-0042" } },
    });
    const [spec] = document.catalog
      .lookup(PDFName.of("AF"), PDFArray)
      .asArray()
      .map((ref) => document.context.lookup(ref));
    expect(spec).toBeInstanceOf(PDFDict);
    const fileSpec = spec as PDFDict;
    expect(fileSpec.get(PDFName.of("AFRelationship"))).toBe(PDFName.of("Alternative"));
    const ef = rawStream(fileSpec.lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F")));
    expect(ef.dict.get(PDFName.of("Subtype"))).toBe(PDFName.of("text/xml"));
  });

  it("says PDF/A-3 with the Factur-X properties and their schema, unfiltered", async () => {
    const { document } = await made();
    const { stream, text } = metadata(document);
    expect(stream.dict.has(PDFName.of("Filter"))).toBe(false);
    expect(text).toContain("<pdfaid:part>3</pdfaid:part><pdfaid:conformance>A</pdfaid:conformance>");
    expect(text).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
    expect(text).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");
    expect(text).toContain(
      "<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>",
    );
    for (const name of ["DocumentFileName", "DocumentType", "Version", "ConformanceLevel"]) {
      expect(text).toContain(`<pdfaProperty:name>${name}</pdfaProperty:name>`);
    }
    // The creation date stays the converter's; the modification is now, to the second.
    expect(text).toContain("<xmp:CreateDate>2026-10-25T03:39:43+00:00</xmp:CreateDate>");
    expect(text).toContain("<xmp:ModifyDate>2026-10-25T04:00:00Z</xmp:ModifyDate>");
  });

  it("names Schreibzeug as producer in the Info dictionary and the XMP alike", async () => {
    const { document } = await made();
    expect(document.getProducer()).toBe("Schreibzeug");
    expect(document.getCreator()).toBe("Schreibzeug");
    expect(document.getModificationDate()?.toISOString()).toBe("2026-10-25T04:00:00.000Z");
    expect(metadata(document).text).toContain("<pdf:Producer>Schreibzeug</pdf:Producer>");
  });

  it("refuses a PDF that is no PDF/A-2 or -3", async () => {
    const plain = await PDFDocument.create();
    plain.addPage();
    const error = { ok: false, error: "Das PDF ist kein PDF/A-2 oder PDF/A-3." };
    expect(await zugferdPdf(await plain.save(), "<x/>")).toEqual(error);
    expect(
      await zugferdPdf(
        await pdfA2("<pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>"),
        "<x/>",
      ),
    ).toEqual(error);
  });
});

describe("zugferdXmp", () => {
  it("writes a title with a character XML 1.0 has none for as a space", () => {
    const xmp = zugferdXmp({
      conformance: "B",
      created: "c",
      modified: "m",
      title: "Rechnung\u000B4711 & Co",
    });
    expect(xmp).toContain('<rdf:li xml:lang="x-default">Rechnung 4711 &amp; Co</rdf:li>');
  });
});
