import {
  PIVOT_AREAS,
  PIVOT_SUMMARIES,
  type PivotArea,
  type PivotCommands,
  type PivotItem,
  type PivotState,
  type PivotSummary,
  VALUES_FIELD,
} from "@schreibzeug/editor-core";
import { RefreshCw, X } from "lucide-react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";

/** Excel's names of the four areas. */
export const AREA_LABELS: Record<PivotArea, string> = {
  filters: m.pivot_panel_filters(),
  columns: m.pivot_panel_columns(),
  rows: m.pivot_panel_rows(),
  values: m.pivot_panel_values(),
};

/** Excel's names of the summaries, as it names a value ("Summe von Betrag"). */
const SUMMARY_LABELS: Record<PivotSummary, string> = {
  sum: m.pivot_panel_sum(),
  count: m.pivot_panel_count(),
  average: m.pivot_panel_average(),
  max: m.pivot_panel_max(),
  min: m.pivot_panel_min(),
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
        aria-label={m.pivot_panel_summary_for({ name: item.name })}
        value={item.value.summary ?? ""}
        onChange={(event) => pivots.setSummary(item, event.target.value as (typeof PIVOT_SUMMARIES)[number])}
        className={selectClass}
      >
        {item.value.summary === null && <option value="">{m.pivot_panel_other()}</option>}
        {PIVOT_SUMMARIES.map((summary) => (
          <option key={summary} value={summary}>
            {SUMMARY_LABELS[summary]}
          </option>
        ))}
      </select>
    )}
    <select
      aria-label={m.pivot_panel_move({ name: item.name })}
      value=""
      onChange={(event) => pivots.move(item, event.target.value as PivotArea)}
      className={selectClass}
    >
      <option value="" disabled>
        {m.pivot_panel_move_to()}
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
    aria-label={m.pivot_panel_title()}
    className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-3"
  >
    <header className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-sm font-semibold">{m.pivot_panel_title()}</h2>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          aria-label={m.pivot_panel_refresh_label()}
          title={m.pivot_panel_refresh()}
          onClick={pivots.refresh}
        >
          <RefreshCw size={16} />
        </Button>
        <Button variant="ghost" aria-label={m.pivot_panel_close()} onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
    </header>
    <section aria-label={m.pivot_panel_fields()} className="flex flex-col gap-1">
      <h3 className="m-0 text-xs font-medium text-[var(--muted-foreground)]">{m.pivot_panel_fields()}</h3>
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
            <p className="m-0 px-1 text-xs text-[var(--muted-foreground)]">{m.pivot_panel_empty()}</p>
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
