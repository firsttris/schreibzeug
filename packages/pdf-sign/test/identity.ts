import forge from "node-forge";

/**
 * A self-signed certificate with its RSA key as a PKCS#12 file, made for the tests: the kind of
 * .p12 someone exports from their certificate store. 2048 bits, as certificates for signing are.
 */
export const makeP12 = (commonName: string, password: string): Uint8Array => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2036-01-01T00:00:00Z");
  const subject = [
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "Schreibzeug Test" },
    { name: "countryName", value: "DE" },
  ];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, { algorithm: "aes256" });
  return Uint8Array.from(forge.asn1.toDer(p12).getBytes(), (char) => char.charCodeAt(0));
};
