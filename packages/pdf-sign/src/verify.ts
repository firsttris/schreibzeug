import forge from "node-forge";
import { PDFHexString, PDFString } from "pdf-lib";
import { type ByteRange, latin1, signedBytes, toBinary } from "./bytes";

/** What a signature in a PDF says, and whether it holds. */
export type SignatureCheck = {
  signer: string;
  /** The signing time the signature carries, if any. */
  signedAt: Date | null;
  reason: string | null;
  location: string | null;
  issuer: string;
  /** The certificate signed itself: nobody vouches for who it names. */
  selfSigned: boolean;
  /** The signed bytes are unchanged and the signature belongs to the certificate. */
  intact: boolean;
  /** The signature covers the whole file: nothing was added after signing. */
  coversWholeFile: boolean;
  /** Why the signature does not hold, if it does not. */
  problem: string | null;
};

const name = (attributes: forge.pki.Certificate["subject"]) =>
  String(attributes.getField("CN")?.value ?? attributes.getField("O")?.value ?? "Unbekannt");

/**
 * The text of a string in the signature dictionary's text, e.g. /Reason: a literal string with
 * its escapes, or a hex string as signPdf writes them (ISO 32000-1 7.3.4).
 */
const dictionaryString = (dictionary: string, key: string): string | null => {
  const match = new RegExp(`/${key}\\s*(?:\\(((?:\\\\.|[^\\\\)])*)\\)|<([0-9A-Fa-f\\s]*)>)`).exec(dictionary);
  const [, literal, hex] = match ?? [];
  if (literal !== undefined) return PDFString.of(literal).decodeText();
  if (hex !== undefined) return PDFHexString.of(hex.replace(/\s/g, "")).decodeText();
  return null;
};

const DIGESTS: Record<string, () => forge.md.MessageDigest> = {
  [forge.pki.oids.sha256 as string]: () => forge.md.sha256.create(),
  [forge.pki.oids.sha384 as string]: () => forge.md.sha384.create(),
  [forge.pki.oids.sha512 as string]: () => forge.md.sha512.create(),
  [forge.pki.oids.sha1 as string]: () => forge.md.sha1.create(),
};

type Attribute = { type: string; value: forge.asn1.Asn1 };

/** The children of a constructed ASN.1 node; a missing one is a signature this code cannot read. */
const children = (node: forge.asn1.Asn1 | undefined): forge.asn1.Asn1[] => {
  if (!node || !Array.isArray(node.value)) throw new Error("Unexpected ASN.1 structure.");
  return node.value;
};
const child = (node: forge.asn1.Asn1 | undefined, index: number): forge.asn1.Asn1 => {
  const found = children(node).at(index);
  if (!found) throw new Error("Unexpected ASN.1 structure.");
  return found;
};

const attributesOf = (set: forge.asn1.Asn1): Attribute[] =>
  children(set).map((attribute) => ({
    type: forge.asn1.derToOid(child(attribute, 0).value as string),
    value: child(child(attribute, 1), 0),
  }));

/**
 * Checks one PKCS#7 signature (RFC 2315, as signPdf writes it and readers accept): the digest of the
 * signed bytes against the messageDigest attribute, and the signer's RSA signature over the
 * attributes, with the certificate the signature carries.
 */
const checkPkcs7 = (der: string, data: Uint8Array) => {
  const content = forge.asn1.fromDer(der);
  const message = forge.pkcs7.messageFromAsn1(content) as forge.pkcs7.PkcsSignedData;
  // ContentInfo → [0] SignedData → signerInfos (its last field) → the first SignerInfo.
  const signedData = child(child(content, 1), 0);
  const signerInfo = child(child(signedData, -1), 0);
  const fields = children(signerInfo);
  const digestOid = forge.asn1.derToOid(child(child(signerInfo, 2), 0).value as string);
  const attributesNode = fields.find(
    (field) => field.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && field.type === 0,
  );
  const signature = fields.at(-1)?.type === forge.asn1.Type.OCTETSTRING ? fields.at(-1) : fields.at(-2);
  const certificate = message.certificates[0];
  const digest = DIGESTS[digestOid];
  if (!attributesNode || !signature || !certificate || !digest) {
    return {
      certificate,
      intact: false,
      problem: "Die Signatur hat eine Form, die Schreibzeug nicht prüfen kann.",
      signedAt: null,
    };
  }
  const attributes = attributesOf(attributesNode);
  const messageDigest = attributes.find((a) => a.type === forge.pki.oids.messageDigest)?.value.value;
  const signingTime = attributes.find((a) => a.type === forge.pki.oids.signingTime)?.value;
  const signedAt = signingTime ? forge.asn1.utcTimeToDate(signingTime.value as string) : null;

  const dataDigest = digest().update(toBinary(data)).digest().getBytes();
  if (messageDigest !== dataDigest) {
    return { certificate, intact: false, problem: "Das PDF wurde nach dem Signieren verändert.", signedAt };
  }
  // The attributes are signed as a SET, not with the [0] tag they carry in the SignerInfo.
  const set = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    children(attributesNode),
  );
  const attributesDigest = digest().update(forge.asn1.toDer(set).getBytes()).digest().getBytes();
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  let verified = false;
  try {
    verified = publicKey.verify(attributesDigest, signature.value as string);
  } catch {
    verified = false;
  }
  return {
    certificate,
    intact: verified,
    problem: verified ? null : "Die Signatur passt nicht zum Zertifikat.",
    signedAt,
  };
};

/**
 * The DER signature without the zeros that fill the rest of /Contents. Its length is the one its
 * outer header states (X.690 8.1.3): the signature itself may end in a zero byte.
 */
const withoutPadding = (bytes: string): string => {
  const first = bytes.charCodeAt(1);
  if (first < 0x80) return bytes.slice(0, 2 + first);
  const count = first & 0x7f;
  // An indefinite length (0x80) is not DER; the parser is left to refuse it.
  if (count === 0) return bytes;
  const contentLength = Array.from(bytes.slice(2, 2 + count)).reduce(
    (sum, char) => sum * 256 + char.charCodeAt(0),
    0,
  );
  return bytes.slice(0, 2 + count + contentLength);
};

/** At most this many signatures are checked: a few /ByteRange entries must not cost a lot of work. */
export const MAX_SIGNATURES = 32;
/** The largest /Contents read, in bytes: room for a PAdES signature with its certificates. */
const MAX_CONTENTS_BYTES = 128 * 1024;

const UNREADABLE = "Die Signatur lässt sich nicht lesen.";
const UNSIGNED_DATA = "Neben der Signatur stehen ungeprüfte Daten.";

type Checked = ReturnType<typeof checkPkcs7>;
const refused = (problem: string): Checked => ({
  certificate: undefined,
  intact: false,
  problem,
  signedAt: null,
});

/**
 * A ByteRange as signers write it (ISO 32000-1 12.8.1): from the start of the file up to the
 * /Contents string and from its end on, inside the file, with a gap of bounded size.
 */
const isSaneRange = ([a, b, c, d]: ByteRange, size: number): boolean =>
  a === 0 && b > 0 && c > b && c - b <= 2 * MAX_CONTENTS_BYTES + 2 && c + d <= size;

/**
 * The signature in the gap, or why it cannot hold: the gap is exactly one hex string, and after
 * the DER signature it holds only zero padding, so nothing unsigned can ride along.
 */
const signatureInGap = (gap: string): { der: string } | { problem: string } => {
  if (!/^<(?:[0-9A-Fa-f]{2})*>$/.test(gap)) return { problem: UNREADABLE };
  const hex = gap.slice(1, -1);
  const der = withoutPadding(forge.util.hexToBytes(hex));
  return /^0*$/.test(hex.slice(2 * der.length)) ? { der } : { problem: UNSIGNED_DATA };
};

/** The signature dictionary's text without the gap: only what the signature covers. */
const signedDictionary = (text: string, matchIndex: number, [, b, c, d]: ByteRange): string => {
  const start = text.lastIndexOf("<<", matchIndex);
  const found = text.indexOf(">>", c);
  const end = found < 0 ? c : Math.min(found, c + d);
  return text.slice(Math.min(start < 0 ? b : start, b), b) + text.slice(c, end);
};

const checkOne = (pdf: Uint8Array, text: string, matchIndex: number, range: ByteRange): SignatureCheck => {
  const sane = isSaneRange(range, pdf.length);
  const inGap = sane ? signatureInGap(text.slice(range[1], range[2])) : { problem: UNREADABLE };
  let checked: Checked;
  try {
    checked = "der" in inGap ? checkPkcs7(inGap.der, signedBytes(pdf, range)) : refused(inGap.problem);
  } catch {
    checked = refused(UNREADABLE);
  }
  const { certificate } = checked;
  const dictionary = sane ? signedDictionary(text, matchIndex, range) : "";
  return {
    signer: certificate ? name(certificate.subject) : "Unbekannt",
    signedAt: checked.signedAt,
    reason: dictionaryString(dictionary, "Reason"),
    location: dictionaryString(dictionary, "Location"),
    issuer: certificate ? name(certificate.issuer) : "Unbekannt",
    selfSigned: certificate ? certificate.isIssuer(certificate) : false,
    intact: checked.intact,
    coversWholeFile: range[2] + range[3] === pdf.length,
    problem: checked.problem,
  };
};

/**
 * Every signature in the PDF, in file order, each checked, at most MAX_SIGNATURES. A ByteRange
 * that is not one a signer writes counts as an unreadable signature, before any of it is decoded.
 */
export const checkSignatures = (pdf: Uint8Array): SignatureCheck[] => {
  const text = latin1(pdf);
  const checks: SignatureCheck[] = [];
  for (const match of text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    if (checks.length >= MAX_SIGNATURES) break;
    checks.push(checkOne(pdf, text, match.index, match.slice(1, 5).map(Number) as ByteRange));
  }
  return checks;
};
