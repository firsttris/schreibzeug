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
 * The text of a string in the signature dictionary near the position, e.g. /Reason: a literal
 * string with its escapes, or a hex string as signPdf writes them (ISO 32000-1 7.3.4).
 */
const dictionaryString = (text: string, from: number, to: number, key: string): string | null => {
  const match = new RegExp(`/${key}\\s*(?:\\(((?:\\\\.|[^\\\\)])*)\\)|<([0-9A-Fa-f\\s]*)>)`).exec(
    text.slice(from, to),
  );
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

/** Every signature in the PDF, in file order, each checked. */
export const checkSignatures = (pdf: Uint8Array): SignatureCheck[] => {
  const text = latin1(pdf);
  return [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((match) => {
    const range = match.slice(1, 5).map(Number) as ByteRange;
    const [, length, second] = range;
    const hex = text.slice(length + 1, second - 1).replace(/0+$/, "");
    const der = forge.util.hexToBytes(hex.length % 2 ? `${hex}0` : hex);
    const dictionaryStart = text.lastIndexOf("<<", match.index ?? 0);
    const dictionaryEnd = text.indexOf(">>", second);
    let checked: ReturnType<typeof checkPkcs7>;
    try {
      checked = checkPkcs7(der, signedBytes(pdf, range));
    } catch {
      checked = {
        certificate: undefined,
        intact: false,
        problem: "Die Signatur lässt sich nicht lesen.",
        signedAt: null,
      };
    }
    const { certificate } = checked;
    return {
      signer: certificate ? name(certificate.subject) : "Unbekannt",
      signedAt: checked.signedAt,
      reason: dictionaryString(text, dictionaryStart, dictionaryEnd, "Reason"),
      location: dictionaryString(text, dictionaryStart, dictionaryEnd, "Location"),
      issuer: certificate ? name(certificate.issuer) : "Unbekannt",
      selfSigned: certificate ? certificate.isIssuer(certificate) : false,
      intact: checked.intact,
      coversWholeFile: range[2] + range[3] === pdf.length,
      problem: checked.problem,
    };
  });
};
