import {
  PIVOT_AREAS,
  PIVOT_SUMMARIES,
  type PivotArea,
  type PivotCommands,
  type PivotItem,
  type PivotState,
  SUMMARY_NAMES,
  VALUES_FIELD,
} from "@schreibzeug/editor-core";
import { RefreshCw, X } from "lucide-react";
import { Button } from "../ui/button";

/** Excel's names of the four areas. */
export const AREA_LABELS: Record<PivotArea, string> = {
  filters: "Filter",
  columns: "Spalten",
  rows: "Zeilen",
  values: "Werte",
};

/** Where an entry may go: "Werte" only between rows and columns (PivotTables.js st_VALUES). */
export const targetsOf = (item: PivotItem): PivotArea[] =>
  PIVOT_AREAS.filter(
    (area) => area !== item.area && (item.field !== VALUES_FIELD || area === "rows" || area === "columns"),
  );

const selectClass =
  "h-7 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 text-xs outline-none focus:border-[var(--foreground)]";

const ItemRow = ({ item, pivots }: { item: PivotItem; pivots: PivotCommands }) => (
  <li className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[var(--muted)]">
    {/* A value's name ("Summe von Betrag") gets a line of its own, its two choices below it. */}
    <span className={`min-w-0 flex-1 truncate ${item.value ? "basis-full" : ""}`} title={item.name}>
      {item.name}
    </span>
    {item.value?.summary !== undefined && (
      <select
        aria-label={`Berechnung für ${item.name}`}
        value={item.value.summary ?? ""}
        onChange={(event) => pivots.setSummary(item, event.target.value as (typeof PIVOT_SUMMARIES)[number])}
        className={selectClass}
      >
        {item.value.summary === null && <option value="">Andere</option>}
        {PIVOT_SUMMARIES.map((summary) => (
          <option key={summary} value={summary}>
            {SUMMARY_NAMES[summary]}
          </option>
        ))}
      </select>
    )}
    <select
      aria-label={`${item.name} verschieben`}
      value=""
      onChange={(event) => pivots.move(item, event.target.value as PivotArea)}
      className={selectClass}
    >
      <option value="" disabled>
        Nach …
      </option>
      {targetsOf(item).map((area) => (
        <option key={area} value={area}>
          {AREA_LABELS[area]}
        </option>
      ))}
    </select>
  </li>
);

type PivotPanelProps = { pivot: PivotState; pivots: PivotCommands; onClose: () => void };

/**
 * The field list of the pivot table at the active cell, as Excel and web-apps (PivotSettings.js)
 * show it beside the grid: the source's columns to tick, and the four areas with what is in them.
 * Instead of dragging, each entry has where it may go, and a value how it is summed up.
 */
export const PivotPanel = ({ pivot, pivots, onClose }: PivotPanelProps) => (
  <aside
    aria-label="Pivot-Tabelle"
    className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-3"
  >
    <header className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-sm font-semibold">Pivot-Tabelle</h2>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          aria-label="Pivot-Tabelle aktualisieren"
          title="Aktualisieren"
          onClick={pivots.refresh}
        >
          <RefreshCw size={16} />
        </Button>
        <Button variant="ghost" aria-label="Feldliste schließen" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
    </header>
    <section aria-label="Felder" className="flex flex-col gap-1">
      <h3 className="m-0 text-xs font-medium text-[var(--muted-foreground)]">Felder</h3>
      {pivot.fields.map((field) => (
        <label
          key={field.index}
          className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[var(--muted)]"
        >
          <input
            type="checkbox"
            checked={field.used}
            onChange={(event) => pivots.toggleField(field.index, event.target.checked)}
          />
          <span className="truncate">{field.name}</span>
        </label>
      ))}
    </section>
    {PIVOT_AREAS.map((area) => {
      const items = pivot.items.filter((item) => item.area === area);
      return (
        <section key={area} aria-label={AREA_LABELS[area]} className="flex flex-col gap-1">
          <h3 className="m-0 text-xs font-medium text-[var(--muted-foreground)]">{AREA_LABELS[area]}</h3>
          {items.length === 0 ? (
            <p className="m-0 px-1 text-xs text-[var(--muted-foreground)]">Leer</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {items.map((item) => (
                <ItemRow key={`${item.field}-${item.value?.index ?? ""}`} item={item} pivots={pivots} />
              ))}
            </ul>
          )}
        </section>
      );
    })}
  </aside>
);
