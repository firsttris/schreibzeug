import type { SignatureCheck } from "@schreibzeug/pdf-sign";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** The signing code (node-forge) loads when someone signs or a PDF has signatures, not with the app. */
export const loadPdfSign = () => import("@schreibzeug/pdf-sign");

const inputClass =
  "h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)]";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export type SigningRequest = { certificate: Uint8Array; password: string; reason: string; location: string };

export type DigitalSignatureDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Signs the saved PDF; resolves with why it could not, or null once it is signed and stored. */
  onSign: (request: SigningRequest) => Promise<string | null>;
};

/**
 * A digital signature with the person's own certificate (a .p12 or .pfx file and its password).
 * The certificate stays in the browser; only the signed PDF goes to the server.
 */
export const DigitalSignatureDialog = ({ open, onClose, onSign }: DigitalSignatureDialogProps) => (
  <Dialog open={open} title="Digital signieren" wide onClose={onClose}>
    {open && <SigningForm onClose={onClose} onSign={onSign} />}
  </Dialog>
);

const SigningForm = ({ onClose, onSign }: Omit<DigitalSignatureDialogProps, "open">) => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setFailure(null);
    const problem = await onSign({
      certificate: new Uint8Array(await file.arrayBuffer()),
      password,
      reason: reason.trim(),
      location: location.trim(),
    });
    setBusy(false);
    if (problem) setFailure(problem);
    else onClose();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <p className="m-0 text-sm text-[var(--muted-foreground)]">
        Signiert wird der gespeicherte Stand. Das signierte PDF wird als neue Version gespeichert; jede
        spätere Änderung macht die Signatur ungültig. Das Zertifikat verlässt den Browser nicht.
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Zertifikat (.p12 oder .pfx)</span>
        <input
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Passwort des Zertifikats</span>
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Grund</span>
        <input
          className={inputClass}
          value={reason}
          placeholder="z. B. Auftrag bestätigt"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Ort</span>
        <input
          className={inputClass}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={!file || busy}>
          {busy ? "Signiert …" : "Signieren"}
        </Button>
      </div>
    </form>
  );
};

/** One line per signature: who, when, why, and whether it holds. */
export const describeSignature = (check: SignatureCheck): { ok: boolean; text: string } => {
  const when = check.signedAt ? ` am ${dateTime.format(check.signedAt)}` : "";
  const why = check.reason ? ` · Grund: ${check.reason}` : "";
  const head = `Digital signiert von ${check.signer}${when}${why}`;
  if (!check.intact) return { ok: false, text: `${head} · Signatur ungültig: ${check.problem}` };
  if (!check.coversWholeFile) {
    return {
      ok: false,
      text: `${head} · Nach dem Signieren wurde das PDF ergänzt; die Signatur deckt das nicht ab.`,
    };
  }
  const trust = check.selfSigned
    ? "selbst ausgestelltes Zertifikat, niemand bestätigt den Namen"
    : `Zertifikat von ${check.issuer}, die Vertrauenskette prüft Schreibzeug nicht`;
  return { ok: true, text: `${head} · Signatur gültig (${trust})` };
};

export type SignatureNoticeProps = {
  checks: SignatureCheck[];
  /** The PDF has changes that are not saved yet: saving them breaks the signature. */
  modified: boolean;
};

/** Above a signed PDF: its signatures, checked, and a warning once it is being changed. */
export const SignatureNotice = ({ checks, modified }: SignatureNoticeProps) => {
  if (checks.length === 0) return null;
  return (
    <div
      data-testid="signature-notice"
      className="flex flex-col gap-1 border-b border-[var(--border)] px-4 py-2 text-xs"
    >
      {checks.map((check) => {
        const { ok, text } = describeSignature(check);
        const Icon = ok ? ShieldCheck : ShieldAlert;
        return (
          <p
            key={text}
            className={`m-0 flex items-center gap-2 ${ok ? "" : "text-red-600 dark:text-red-400"}`}
          >
            <Icon size={14} />
            {text}
          </p>
        );
      })}
      {modified && (
        <p className="m-0 text-red-600 dark:text-red-400">
          Das PDF wird geändert: Beim Speichern wird die Signatur ungültig.
        </p>
      )}
    </div>
  );
};
