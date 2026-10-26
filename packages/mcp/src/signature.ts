import type { SignatureCheck } from "@schreibzeug/pdf-sign";

/**
 * Who vouches for the name a signature carries. Schreibzeug checks no chain against trusted
 * roots, so "gültig" only says the bytes are unchanged and the certificate signed them; the
 * line says that each time, as the interface does (apps/web digital-signature.tsx).
 */
const trustOf = (signature: SignatureCheck): string =>
  signature.selfSigned
    ? "selbst ausgestelltes Zertifikat, niemand bestätigt den Namen"
    : `Zertifikat von ${signature.issuer}, die Vertrauenskette prüft Schreibzeug nicht; der Name ist nicht bestätigt`;

/** One line of read_pdf's "Signaturen": signer, date, whether it holds, and who vouches for it. */
export const signatureLine = (signature: SignatureCheck): string => {
  const when = signature.signedAt ? `, ${signature.signedAt.toISOString().slice(0, 10)}` : "";
  const state =
    signature.intact && signature.coversWholeFile
      ? "gültig"
      : `ungültig (${signature.problem ?? "nach dem Signieren geändert"})`;
  return `- ${signature.signer}${when}: ${state} (${trustOf(signature)})`;
};
