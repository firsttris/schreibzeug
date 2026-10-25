import { AFRelationship, decodePDFRawStream, PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";
import type { Read } from "./types";
import { escapeXml } from "./write-cii";

/*
 * A ZUGFeRD 2 / Factur-X PDF: a PDF/A-3 with the invoice XML attached as "factur-x.xml"
 * (/AFRelationship /Alternative, listed in the catalog's /AF) and the Factur-X properties in its
 * XMP metadata, declared by a PDF/A extension schema (Factur-X 1.0 specification, 6.2; ISO 19005-3
 * 6.8 and 6.6.2.3). The PDF/A-2 the converter writes is made one by these changes: PDF/A-3 differs
 * from it in allowing attachments of any kind.
 */

export const FACTURX_FILENAME = "factur-x.xml";
const FX_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";
/** What the PDF says made it; also in place of the engine's own name. */
const PRODUCER = "Schreibzeug";

const FX_PROPERTIES: Array<[name: string, description: string]> = [
  ["DocumentFileName", "The name of the embedded XML document"],
  ["DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER"],
  ["Version", "The actual version of the standard applying to the embedded XML document"],
  ["ConformanceLevel", "The conformance level of the embedded XML document"],
];

/** "2026-10-25T03:39:43Z": seconds, as the Info dictionary's dates have them. */
const xmpDate = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;

type Xmp = { conformance: string; created: string; modified: string; title?: string | undefined };

/** The XMP packet: the PDF/A identification, the Factur-X properties and their schema. */
export const zugferdXmp = ({ conformance, created, modified, title }: Xmp): string => {
  const property = ([name, description]: [string, string]) =>
    '<rdf:li rdf:parseType="Resource">' +
    `<pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType>` +
    `<pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description>` +
    "</rdf:li>";
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>3</pdfaid:part><pdfaid:conformance>${conformance}</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<pdf:Producer>${PRODUCER}</pdf:Producer><xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
<xmp:CreateDate>${created}</xmp:CreateDate><xmp:ModifyDate>${modified}</xmp:ModifyDate>
</rdf:Description>${
    title
      ? `
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>
</rdf:Description>`
      : ""
  }
<rdf:Description rdf:about="" xmlns:fx="${FX_NAMESPACE}">
<fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
<fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>${FX_NAMESPACE}</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>${FX_PROPERTIES.map(property).join("")}</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};

/** The XMP the converter wrote, as text; empty when there is none. */
const metadataOf = (document: PDFDocument): string => {
  const stream = document.catalog.lookup(PDFName.of("Metadata"));
  if (stream instanceof PDFRawStream) return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  if (stream instanceof PDFStream) return new TextDecoder().decode(stream.getContents());
  return "";
};

/**
 * Makes the PDF/A a ZUGFeRD invoice with this XML. Refuses a PDF that is no PDF/A: attaching to
 * any PDF would give a file that claims a conformance it does not have.
 */
export const zugferdPdf = async (
  pdfA: Uint8Array,
  xml: string,
  now = new Date(),
): Promise<Read<Uint8Array>> => {
  const document = await PDFDocument.load(pdfA, { updateMetadata: false });
  const metadata = metadataOf(document);
  const conformance = /<pdfaid:conformance>([ABU])<\/pdfaid:conformance>|pdfaid:conformance="([ABU])"/.exec(
    metadata,
  );
  if (!/<pdfaid:part>[23]<\/pdfaid:part>|pdfaid:part="[23]"/.test(metadata) || !conformance) {
    return { ok: false, error: "Das PDF ist kein PDF/A-2 oder PDF/A-3." };
  }
  const created = /<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/.exec(metadata)?.[1] ?? xmpDate(now);
  const modified = new Date(Math.floor(now.getTime() / 1000) * 1000);

  await document.attach(new TextEncoder().encode(xml), FACTURX_FILENAME, {
    mimeType: "text/xml",
    description: "Factur-X Invoice",
    creationDate: modified,
    modificationDate: modified,
    afRelationship: AFRelationship.Alternative,
  });
  // The Info dictionary and the XMP must say the same (ISO 19005-3 6.6.2.3.1).
  document.setProducer(PRODUCER);
  document.setCreator(PRODUCER);
  document.setModificationDate(modified);
  const title = document.getTitle();
  const xmp = zugferdXmp({
    conformance: conformance[1] ?? conformance[2] ?? "B",
    created,
    modified: xmpDate(modified),
    title,
  });
  // Metadata stays unfiltered, so readers without a decoder find it (ISO 19005-3 6.6.2.1).
  const stream = document.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" });
  document.catalog.set(PDFName.of("Metadata"), document.context.register(stream));
  return { ok: true, value: await document.save({ useObjectStreams: false }) };
};
