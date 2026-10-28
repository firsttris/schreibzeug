import { UNITS as UNIT_LABELS, type UnitCode } from "@schreibzeug/einvoice/draft";
import { Plus, Trash2 } from "lucide-react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import type { LineForm } from "./e-invoice";
import { inputClass } from "./e-invoice-fields";

type LinesProps = {
  lines: LineForm[];
  /** The net amount of each line, formatted; "" for one that does not compute. */
  totals: string[];
  showRate: boolean;
  onChange: (lines: LineForm[]) => void;
  onAdd: () => void;
};

/** The invoice's lines: description, quantity and unit, net unit price, VAT rate, net total. */
export const LinesTable = ({ lines, totals, showRate, onChange, onAdd }: LinesProps) => {
  const update = (index: number, patch: Partial<LineForm>) =>
    onChange(lines.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  const remove = (index: number) => onChange(lines.filter((_, at) => at !== index));
  const cell = "px-1 py-1 align-top";

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-xs">
        <thead className="text-left text-[var(--muted-foreground)]">
          <tr>
            <th className={`${cell} w-[36%] font-normal`}>{m.e_invoice_lines_description()}</th>
            <th className={`${cell} font-normal`}>{m.e_invoice_lines_quantity()}</th>
            <th className={`${cell} font-normal`}>{m.e_invoice_lines_unit()}</th>
            <th className={`${cell} font-normal`}>{m.e_invoice_lines_unit_price_net()}</th>
            {showRate && <th className={`${cell} font-normal`}>{m.e_invoice_lines_vat_percent()}</th>}
            <th className={`${cell} whitespace-nowrap text-right font-normal`}>
              {m.e_invoice_lines_total_net()}
            </th>
            <th className={cell} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const position = { number: index + 1 };
            return (
              // Lines have no identity of their own; their place is it.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <tr key={index}>
                <td className={cell}>
                  <input
                    aria-label={m.e_invoice_lines_description_of(position)}
                    className={inputClass}
                    value={line.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                </td>
                <td className={cell}>
                  <input
                    aria-label={m.e_invoice_lines_quantity_of(position)}
                    className={`${inputClass} w-16 text-right`}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                  />
                </td>
                <td className={cell}>
                  <select
                    aria-label={m.e_invoice_lines_unit_of(position)}
                    className={`${inputClass} w-28`}
                    value={line.unit}
                    onChange={(event) => update(index, { unit: event.target.value as UnitCode })}
                  >
                    {Object.entries(UNIT_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cell}>
                  <input
                    aria-label={m.e_invoice_lines_unit_price_of(position)}
                    className={`${inputClass} w-24 text-right`}
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(event) => update(index, { unitPrice: event.target.value })}
                  />
                </td>
                {showRate && (
                  <td className={cell}>
                    <input
                      aria-label={m.e_invoice_lines_vat_of(position)}
                      className={`${inputClass} w-14 text-right`}
                      inputMode="decimal"
                      value={line.taxRate}
                      onChange={(event) => update(index, { taxRate: event.target.value })}
                    />
                  </td>
                )}
                <td className={`${cell} pt-2 text-right tabular-nums`}>{totals[index]}</td>
                <td className={cell}>
                  <Button
                    variant="ghost"
                    aria-label={m.e_invoice_lines_remove(position)}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div>
        <Button variant="ghost" onClick={onAdd}>
          <Plus size={14} />
          {m.e_invoice_lines_add()}
        </Button>
      </div>
    </div>
  );
};
