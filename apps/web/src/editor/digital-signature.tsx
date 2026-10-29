import type { SignatureCheck } from "@schreibzeug/pdf-sign";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { m } from "../paraglide/messages";
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
  <Dialog open={open} title={m.digital_signature_title()} wide onClose={onClose}>
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
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.digital_signature_intro()}</p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{m.digital_signature_certificate()}</span>
        <input
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{m.digital_signature_password()}</span>
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{m.digital_signature_reason()}</span>
        <input
          className={inputClass}
          value={reason}
          placeholder={m.digital_signature_reason_placeholder()}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{m.digital_signature_location()}</span>
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
          {m.common_cancel()}
        </Button>
        <Button variant="primary" type="submit" disabled={!file || busy}>
          {busy ? m.digital_signature_signing() : m.digital_signature_sign()}
        </Button>
      </div>
    </form>
  );
};

/** One line per signature: who, when, why, and whether it holds. */
export const describeSignature = (check: SignatureCheck): { ok: boolean; text: string } => {
  const { signer } = check;
  const who = check.signedAt
    ? m.digital_signature_signed_by_at({ signer, date: dateTime.format(check.signedAt) })
    : m.digital_signature_signed_by({ signer });
  const head = check.reason ? `${who} · ${m.digital_signature_reason_of({ reason: check.reason })}` : who;
  const line = (status: string) => `${head} · ${status}`;
  if (!check.intact)
    return { ok: false, text: line(m.digital_signature_invalid({ problem: check.problem ?? "" })) };
  if (!check.coversWholeFile) return { ok: false, text: line(m.digital_signature_extended()) };
  const valid = check.selfSigned
    ? m.digital_signature_valid_self_signed()
    : m.digital_signature_valid_issuer({ issuer: check.issuer });
  return { ok: true, text: line(valid) };
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
      {modified && <p className="m-0 text-red-600 dark:text-red-400">{m.digital_signature_modified()}</p>}
    </div>
  );
};
