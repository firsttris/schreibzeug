import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";

/**
 * Room for a signature: a signature field whose value is a signature dictionary with a /Contents
 * of zeros and a /ByteRange of placeholders, the way PDF signing works (ISO 32000-1 12.8.1). The
 * file is written once more by pdf-lib; signing then only fills in these two values, so nothing
 * before or after them changes.
 */

/** Bytes kept for the PKCS#7 signature: room for the certificate chain of a usual certificate. */
export const SIGNATURE_BYTES = 16_384;

/** What the /ByteRange holds until the file is signed; the same length as the numbers after. */
export const BYTE_RANGE_PLACEHOLDER = "**********";

export type SignatureInfo = {
  /** Who signs, as the certificate names them. */
  name: string;
  reason?: string;
  location?: string;
  date: Date;
};

/** "Signatur1", "Signatur2", …: a name no other field of the form has. */
const fieldName = (form: PDFDict | undefined) =>
  `Signatur${(form?.lookupMaybe(PDFName.of("Fields"), PDFArray)?.size() ?? 0) + 1}`;

/** The PDF with an empty, invisible signature field on its first page. */
export const addSignaturePlaceholder = async (pdf: Uint8Array, info: SignatureInfo): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const { context, catalog } = doc;
  const placeholder = PDFName.of(BYTE_RANGE_PLACEHOLDER);

  const signature = context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: [PDFNumber.of(0), placeholder, placeholder, placeholder],
    Contents: PDFHexString.of("0".repeat(SIGNATURE_BYTES * 2)),
    Name: PDFString.of(info.name),
    M: PDFString.fromDate(info.date),
    ...(info.reason ? { Reason: PDFString.of(info.reason) } : {}),
    ...(info.location ? { Location: PDFString.of(info.location) } : {}),
  });
  const signatureRef = context.register(signature);

  const page = doc.getPage(0);
  let form = catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  const widget = context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    // Invisible: readers list it in their signature panel. Print and Locked (ISO 32000-1 12.5.3).
    Rect: [0, 0, 0, 0],
    F: 132,
    T: PDFString.of(fieldName(form)),
    V: signatureRef,
    P: page.ref,
  });
  const widgetRef = context.register(widget);

  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(widgetRef);
  else page.node.set(PDFName.of("Annots"), context.obj([widgetRef]));

  if (!form) {
    form = context.obj({ Fields: [] });
    catalog.set(PDFName.of("AcroForm"), context.register(form));
  }
  const fields = form.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (fields) fields.push(widgetRef);
  else form.set(PDFName.of("Fields"), context.obj([widgetRef]));
  // SignaturesExist and AppendOnly: readers keep later changes as incremental updates.
  form.set(PDFName.of("SigFlags"), PDFNumber.of(3));

  // Without object streams, so the signature dictionary stays plain text to fill in.
  return doc.save({ useObjectStreams: false });
};
