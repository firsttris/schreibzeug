import { draftProblems, type InvoiceDraft, totalsOf } from "@schreibzeug/einvoice/draft";
import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  centsText,
  draftFromForm,
  emptyLine,
  type InvoiceForm,
  type PartyForm,
  type SellerForm,
} from "./e-invoice";
import { Field, inputClass, Section } from "./e-invoice-fields";
import { LinesTable } from "./e-invoice-lines";
import { money } from "./invoice";

/** What the dialog starts from: the form filled from the document, and the total it states. */
export type EInvoiceStart = { form: InvoiceForm; statedTotal: number | undefined };

export type EInvoiceDialogProps = {
  start: EInvoiceStart | null;
  onClose: () => void;
  /** Makes and downloads the e-invoice; resolves with why it could not, or null once it is done. */
  onCreate: (draft: InvoiceDraft, seller: SellerForm, remember: boolean) => Promise<string | null>;
};

/**
 * "Als E-Rechnung (ZUGFeRD)": the invoice data as read from the document, to check and complete,
 * then a PDF/A-3 with the Factur-X XML. What the XML says comes from here, not from the page.
 */
export const EInvoiceDialog = ({ start, onClose, onCreate }: EInvoiceDialogProps) => (
  <Dialog open={start !== null} title="Als E-Rechnung (ZUGFeRD)" large onClose={onClose}>
    {start && <EInvoiceForm start={start} onClose={onClose} onCreate={onCreate} />}
  </Dialog>
);

const PartyFields = ({
  party,
  onChange,
}: {
  party: PartyForm;
  onChange: (patch: Partial<PartyForm>) => void;
}) => (
  <div className="grid grid-cols-6 gap-2">
    <Field className="col-span-6" label="Name" value={party.name} onChange={(name) => onChange({ name })} />
    <Field
      className="col-span-6"
      label="Straße"
      value={party.street}
      onChange={(street) => onChange({ street })}
    />
    <Field
      className="col-span-2"
      label="PLZ"
      value={party.postcode}
      onChange={(postcode) => onChange({ postcode })}
    />
    <Field className="col-span-3" label="Ort" value={party.city} onChange={(city) => onChange({ city })} />
    <Field
      className="col-span-1"
      label="Land"
      value={party.country}
      onChange={(country) => onChange({ country })}
    />
    <Field
      className="col-span-3"
      label="USt-IdNr."
      value={party.vatId}
      onChange={(vatId) => onChange({ vatId })}
    />
    <Field
      className="col-span-3"
      label="E-Mail"
      type="email"
      value={party.email}
      onChange={(email) => onChange({ email })}
    />
  </div>
);

const EInvoiceForm = ({
  start,
  onClose,
  onCreate,
}: { start: EInvoiceStart } & Omit<EInvoiceDialogProps, "start">) => {
  const [form, setForm] = useState(start.form);
  const [remember, setRemember] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const draft = draftFromForm(form);
  const totals = totalsOf(draft);
  const problems = draftProblems(draft);
  const set = (patch: Partial<InvoiceForm>) => setForm((current) => ({ ...current, ...patch }));
  const setSeller = (patch: Partial<SellerForm>) =>
    setForm((current) => ({ ...current, seller: { ...current.seller, ...patch } }));
  const setBuyer = (patch: Partial<PartyForm>) =>
    setForm((current) => ({ ...current, buyer: { ...current.buyer, ...patch } }));
  const differs = start.statedTotal !== undefined && start.statedTotal !== totals.gross;

  const create = async () => {
    setTried(true);
    setFailure(null);
    if (problems.length > 0) return;
    setBusy(true);
    const problem = await onCreate(draft, form.seller, remember);
    setBusy(false);
    if (problem) setFailure(problem);
    else onClose();
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-sm text-[var(--muted-foreground)]">
        Aus dem Dokument entsteht ein PDF/A-3 mit den Rechnungsdaten als Factur-X-XML (ZUGFeRD, Profil EN
        16931), wie es Buchhaltungsprogramme lesen. Die Daten unten stammen aus dem Dokument; bitte prüfen und
        ergänzen. In die XML kommt, was hier steht.
      </p>

      <Section title="Rechnung">
        <div className="grid grid-cols-6 gap-2">
          <Field
            className="col-span-2"
            label="Rechnungsnummer"
            value={form.number}
            onChange={(number) => set({ number })}
          />
          <Field
            className="col-span-2"
            label="Rechnungsdatum"
            type="date"
            value={form.issueDate}
            onChange={(issueDate) => set({ issueDate })}
          />
          <Field
            className="col-span-2"
            label="Fällig am"
            type="date"
            value={form.dueDate}
            onChange={(dueDate) => set({ dueDate })}
          />
          <Field
            className="col-span-2"
            label="Leistung vom"
            type="date"
            value={form.serviceFrom}
            onChange={(serviceFrom) => set({ serviceFrom })}
          />
          <Field
            className="col-span-2"
            label="Leistung bis"
            type="date"
            value={form.serviceTo}
            onChange={(serviceTo) => set({ serviceTo })}
          />
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted-foreground)]">Umsatzsteuer</span>
            <select
              className={inputClass}
              value={form.taxMode}
              onChange={(event) => set({ taxMode: event.target.value as InvoiceForm["taxMode"] })}
            >
              <option value="regular">mit Umsatzsteuer</option>
              <option value="small-business">Kleinunternehmer (§ 19 UStG)</option>
            </select>
          </label>
        </div>
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Rechnungssteller">
          <PartyFields party={form.seller} onChange={setSeller} />
          <div className="grid grid-cols-6 gap-2">
            <Field
              className="col-span-3"
              label="Steuernummer"
              value={form.seller.taxNumber}
              onChange={(taxNumber) => setSeller({ taxNumber })}
            />
            <Field
              className="col-span-3"
              label="BIC"
              value={form.seller.bic}
              onChange={(bic) => setSeller({ bic })}
            />
            <Field
              className="col-span-6"
              label="IBAN"
              value={form.seller.iban}
              onChange={(iban) => setSeller({ iban })}
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            In diesem Browser für die nächste Rechnung merken
          </label>
        </Section>
        <Section title="Empfänger">
          <PartyFields party={form.buyer} onChange={setBuyer} />
          <Field
            label="Leitweg-ID oder Bestellnummer"
            value={form.buyerReference}
            onChange={(buyerReference) => set({ buyerReference })}
          />
        </Section>
      </div>

      <Section title="Positionen">
        <LinesTable
          lines={form.lines}
          totals={totals.lines.map(centsText)}
          showRate={form.taxMode === "regular"}
          onChange={(lines) => set({ lines })}
          onAdd={() => set({ lines: [...form.lines, emptyLine(form.lines.at(-1)?.taxRate)] })}
        />
        <dl
          className="m-0 ml-auto grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm tabular-nums"
          aria-label="Summen"
        >
          <dt className="text-[var(--muted-foreground)]">Netto</dt>
          <dd className="m-0 text-right">{money(totals.net, "EUR")}</dd>
          <dt className="text-[var(--muted-foreground)]">Umsatzsteuer</dt>
          <dd className="m-0 text-right">{money(totals.tax, "EUR")}</dd>
          <dt className="font-medium">Rechnungsbetrag</dt>
          <dd className="m-0 text-right font-medium">{money(totals.gross, "EUR")}</dd>
        </dl>
        {differs && (
          <p role="status" className="m-0 text-sm text-amber-700 dark:text-amber-400">
            Im Dokument steht ein Rechnungsbetrag von {money(start.statedTotal ?? 0, "EUR")}; die Positionen
            ergeben {money(totals.gross, "EUR")}. Bitte prüfen: Die E-Rechnung enthält die Positionen, wie sie
            hier stehen.
          </p>
        )}
      </Section>

      {tried && problems.length > 0 && (
        <ul role="alert" className="m-0 flex flex-col gap-0.5 pl-4 text-sm text-red-600 dark:text-red-400">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {busy ? "Wird erstellt …" : "E-Rechnung erstellen"}
        </Button>
      </div>
    </div>
  );
};
