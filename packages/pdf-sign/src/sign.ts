import forge from "node-forge";
import { type ByteRange, fromBinary, latin1, signedBytes, toBinary } from "./bytes";
import {
  addSignaturePlaceholder,
  BYTE_RANGE_PLACEHOLDER,
  SIGNATURE_BYTES,
  type SignatureInfo,
} from "./placeholder";

/** The object identifiers in use (RFC 2315, RFC 7292, NIST); node-forge's table types them as optional. */
export const OID = {
  data: "1.2.840.113549.1.7.1",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  sha256: "2.16.840.1.101.3.4.2.1",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  shroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
} as const;

/** A certificate and its key from a PKCS#12 file (.p12, .pfx). */
export type SigningIdentity = {
  key: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  /** The other certificates of the file: the chain up to the issuer, sent along with the signature. */
  chain: forge.pki.Certificate[];
  /** The certificate's common name, else its organisation. */
  name: string;
};

/** Expected failures are values: a wrong password, a file without a key, a PDF too large. */
export type Signed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Thrown inside this module only, and turned into a value at its edge (asResult). */
type Refusal = { refusal: string };
function refuse(message: string): never {
  throw { refusal: message } satisfies Refusal;
}
const isRefusal = (error: unknown): error is Refusal =>
  typeof error === "object" && error !== null && "refusal" in error;

const asResult = async <T>(run: () => T | Promise<T>): Promise<Signed<T>> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (isRefusal(error)) return { ok: false, error: error.refusal };
    throw error;
  }
};

const commonName = (certificate: forge.pki.Certificate): string =>
  String(
    certificate.subject.getField("CN")?.value ?? certificate.subject.getField("O")?.value ?? "Unbekannt",
  );

const sameKey = (key: forge.pki.rsa.PrivateKey, certificate: forge.pki.Certificate) => {
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  return publicKey.n?.equals(key.n) ?? false;
};

/**
 * Opens a PKCS#12 file with its password. RSA keys only: node-forge signs with RSA, as most
 * certificates for signing documents are.
 */
const identityOf = (p12: Uint8Array, password: string): SigningIdentity => {
  let store: forge.pkcs12.Pkcs12Pfx;
  try {
    store = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(toBinary(p12)), password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    refuse(
      /mac|password|decrypt/i.test(message)
        ? "Das Passwort passt nicht zur Zertifikatsdatei."
        : `Die Zertifikatsdatei lässt sich nicht lesen: ${message}`,
    );
  }
  const bags = (type: string): forge.pkcs12.Bag[] => store.getBags({ bagType: type })[type] ?? [];
  const keys = [...bags(OID.shroudedKeyBag), ...bags(OID.keyBag)]
    .map((bag) => bag.key as forge.pki.rsa.PrivateKey | undefined)
    .filter((key): key is forge.pki.rsa.PrivateKey => Boolean(key?.n));
  const certificates = bags(OID.certBag)
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  const key = keys[0];
  if (!key) refuse("Die Zertifikatsdatei enthält keinen RSA-Schlüssel.");
  const certificate = certificates.find((cert: forge.pki.Certificate) => sameKey(key, cert));
  if (!certificate) refuse("Die Zertifikatsdatei enthält kein Zertifikat zum Schlüssel.");
  return {
    key,
    certificate,
    chain: certificates.filter((cert: forge.pki.Certificate) => cert !== certificate),
    name: commonName(certificate),
  };
};

export const readIdentity = (p12: Uint8Array, password: string): Promise<Signed<SigningIdentity>> =>
  asResult(() => identityOf(p12, password));

/** Where the placeholders are: the /ByteRange array and the /Contents hex string after it. */
export const findPlaceholder = (pdf: Uint8Array) => {
  const text = latin1(pdf);
  // pdf-lib writes arrays with spaces inside the brackets: "/ByteRange [ 0 /********** … ]".
  const star = `/\\${BYTE_RANGE_PLACEHOLDER.split("").join("\\")}`;
  const pattern = new RegExp(`/ByteRange\\s*\\[\\s*0\\s+${star}\\s+${star}\\s+${star}\\s*\\]`, "g");
  const found = [...text.matchAll(pattern)].at(-1);
  if (found?.index === undefined) refuse("Das PDF hat keinen Platz für eine Signatur.");
  const byteRange = found.index;
  const rangeEnd = byteRange + found[0].length;
  const contents = text.indexOf("/Contents <", byteRange);
  const start = text.indexOf("<", contents);
  const end = text.indexOf(">", start) + 1;
  if (contents < 0 || end - start - 2 !== SIGNATURE_BYTES * 2) {
    refuse("Der Platz für die Signatur ist beschädigt.");
  }
  return { byteRange, rangeEnd, start, end };
};

/** "/ByteRange [0 10 20 30]" padded with spaces to the placeholder's length. */
export const byteRangeText = (range: ByteRange, length: number): string => {
  const text = `/ByteRange [${range.join(" ")}]`;
  if (text.length > length) refuse("Das PDF ist zu groß für den Platz der Signatur.");
  return text.padEnd(length, " ");
};

/** A detached PKCS#7 signature (RFC 2315) over the data, SHA-256, with the signing time. */
export const pkcs7 = (data: Uint8Array, identity: SigningIdentity, date: Date): Uint8Array => {
  const message = forge.pkcs7.createSignedData();
  message.content = forge.util.createBuffer(toBinary(data));
  message.addCertificate(identity.certificate);
  for (const certificate of identity.chain) message.addCertificate(certificate);
  message.addSigner({
    key: identity.key,
    certificate: identity.certificate,
    digestAlgorithm: OID.sha256,
    authenticatedAttributes: [
      { type: OID.contentType, value: OID.data },
      { type: OID.messageDigest },
      // node-forge takes a Date here and writes it as UTCTime, though its types say string.
      { type: OID.signingTime, value: date as unknown as string },
    ],
  });
  message.sign({ detached: true });
  return fromBinary(forge.asn1.toDer(message.toAsn1()).getBytes());
};

/**
 * Signs the PDF: adds the signature field, then fills in the byte range and the signature over
 * everything but the signature itself. Returns the signed PDF.
 */
export const signPdf = (
  pdf: Uint8Array,
  identity: SigningIdentity,
  details: Omit<SignatureInfo, "name">,
): Promise<Signed<Uint8Array>> => asResult(() => sign(pdf, identity, details));

const sign = async (
  pdf: Uint8Array,
  identity: SigningIdentity,
  details: Omit<SignatureInfo, "name">,
): Promise<Uint8Array> => {
  const prepared = await addSignaturePlaceholder(pdf, { ...details, name: identity.name });
  const { byteRange, rangeEnd, start, end } = findPlaceholder(prepared);
  const range: ByteRange = [0, start, end, prepared.length - end];
  const signed = prepared.slice();
  signed.set(fromBinary(byteRangeText(range, rangeEnd - byteRange)), byteRange);

  const signature = pkcs7(signedBytes(signed, range), identity, details.date);
  if (signature.length > SIGNATURE_BYTES) refuse("Die Signatur passt nicht in ihren Platz.");
  const hex = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  signed.set(fromBinary(hex.padEnd(SIGNATURE_BYTES * 2, "0")), start + 1);
  return signed;
};
