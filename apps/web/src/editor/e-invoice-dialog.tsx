import { draftProblems, type InvoiceDraft, totalsOf } from "@schreibzeug/einvoice/draft";
import { useState } from "react";
import { m } from "../paraglide/messages";
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
  <Dialog open={start !== null} title={m.e_invoice_dialog_title()} large onClose={onClose}>
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
    <Field
      className="col-span-6"
      label={m.e_invoice_dialog_name()}
      value={party.name}
      onChange={(name) => onChange({ name })}
    />
    <Field
      className="col-span-6"
      label={m.e_invoice_dialog_street()}
      value={party.street}
      onChange={(street) => onChange({ street })}
    />
    <Field
      className="col-span-2"
      label={m.e_invoice_dialog_postcode()}
      value={party.postcode}
      onChange={(postcode) => onChange({ postcode })}
    />
    <Field
      className="col-span-3"
      label={m.e_invoice_dialog_city()}
      value={party.city}
      onChange={(city) => onChange({ city })}
    />
    <Field
      className="col-span-1"
      label={m.e_invoice_dialog_country()}
      value={party.country}
      onChange={(country) => onChange({ country })}
    />
    <Field
      className="col-span-3"
      label={m.e_invoice_dialog_vat_id()}
      value={party.vatId}
      onChange={(vatId) => onChange({ vatId })}
    />
    <Field
      className="col-span-3"
      label={m.e_invoice_dialog_email()}
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
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.e_invoice_dialog_intro()}</p>

      <Section title={m.e_invoice_dialog_invoice()}>
        <div className="grid grid-cols-6 gap-2">
          <Field
            className="col-span-2"
            label={m.e_invoice_dialog_number()}
            value={form.number}
            onChange={(number) => set({ number })}
          />
          <Field
            className="col-span-2"
            label={m.e_invoice_dialog_issue_date()}
            type="date"
            value={form.issueDate}
            onChange={(issueDate) => set({ issueDate })}
          />
          <Field
            className="col-span-2"
            label={m.e_invoice_dialog_due_date()}
            type="date"
            value={form.dueDate}
            onChange={(dueDate) => set({ dueDate })}
          />
          <Field
            className="col-span-2"
            label={m.e_invoice_dialog_service_from()}
            type="date"
            value={form.serviceFrom}
            onChange={(serviceFrom) => set({ serviceFrom })}
          />
          <Field
            className="col-span-2"
            label={m.e_invoice_dialog_service_to()}
            type="date"
            value={form.serviceTo}
            onChange={(serviceTo) => set({ serviceTo })}
          />
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted-foreground)]">{m.e_invoice_dialog_vat()}</span>
            <select
              className={inputClass}
              value={form.taxMode}
              onChange={(event) => set({ taxMode: event.target.value as InvoiceForm["taxMode"] })}
            >
              <option value="regular">{m.e_invoice_dialog_with_vat()}</option>
              <option value="small-business">{m.e_invoice_dialog_small_business()}</option>
            </select>
          </label>
        </div>
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title={m.e_invoice_dialog_seller()}>
          <PartyFields party={form.seller} onChange={setSeller} />
          <div className="grid grid-cols-6 gap-2">
            <Field
              className="col-span-3"
              label={m.e_invoice_dialog_tax_number()}
              value={form.seller.taxNumber}
              onChange={(taxNumber) => setSeller({ taxNumber })}
            />
            <Field
              className="col-span-3"
              label={m.e_invoice_dialog_bic()}
              value={form.seller.bic}
              onChange={(bic) => setSeller({ bic })}
            />
            <Field
              className="col-span-6"
              label={m.e_invoice_dialog_iban()}
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
            {m.e_invoice_dialog_remember()}
          </label>
        </Section>
        <Section title={m.e_invoice_dialog_buyer()}>
          <PartyFields party={form.buyer} onChange={setBuyer} />
          <Field
            label={m.e_invoice_dialog_buyer_reference()}
            value={form.buyerReference}
            onChange={(buyerReference) => set({ buyerReference })}
          />
        </Section>
      </div>

      <Section title={m.e_invoice_dialog_lines()}>
        <LinesTable
          lines={form.lines}
          totals={totals.lines.map(centsText)}
          showRate={form.taxMode === "regular"}
          onChange={(lines) => set({ lines })}
          onAdd={() => set({ lines: [...form.lines, emptyLine(form.lines.at(-1)?.taxRate)] })}
        />
        <dl
          className="m-0 ml-auto grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm tabular-nums"
          aria-label={m.e_invoice_dialog_totals()}
        >
          <dt className="text-[var(--muted-foreground)]">{m.e_invoice_dialog_net()}</dt>
          <dd className="m-0 text-right">{money(totals.net, "EUR")}</dd>
          <dt className="text-[var(--muted-foreground)]">{m.e_invoice_dialog_vat()}</dt>
          <dd className="m-0 text-right">{money(totals.tax, "EUR")}</dd>
          <dt className="font-medium">{m.e_invoice_dialog_gross()}</dt>
          <dd className="m-0 text-right font-medium">{money(totals.gross, "EUR")}</dd>
        </dl>
        {differs && (
          <p role="status" className="m-0 text-sm text-amber-700 dark:text-amber-400">
            {m.e_invoice_dialog_total_differs({
              stated: money(start.statedTotal ?? 0, "EUR"),
              computed: money(totals.gross, "EUR"),
            })}
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
          {m.common_cancel()}
        </Button>
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {busy ? m.e_invoice_dialog_creating() : m.e_invoice_dialog_create()}
        </Button>
      </div>
    </div>
  );
};
