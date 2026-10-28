import type { FilterRequest, SheetEditor, SortOrder } from "@schreibzeug/editor-core";
import { ArrowDownAZ, ArrowDownZA } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { frameToWindow } from "../editor/use-editor-chrome";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";

/** An empty cell's value, as Excel lists it. */
const EMPTY = m.column_filter_empty;

type ColumnFilterProps = {
  request: FilterRequest;
  /** Where the request's point is, in the window. */
  x: number;
  y: number;
  onClose: () => void;
};

/**
 * A column's filter under its button: sorting by the column, and its values to show or hide, as
 * Excel's and web-apps' filter (spreadsheeteditor mobile view/FilterOptions.jsx) offer them. The
 * values are applied together with "OK"; at least one stays shown.
 */
export const ColumnFilter = ({ request, x, y, onClose }: ColumnFilterProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => request.values.map((value) => value.visible));
  const [place, setPlace] = useState({ left: x, top: y });
  const all = shown.every(Boolean);
  const none = !shown.some(Boolean);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPlace({
      left: Math.max(margin, Math.min(x - box.width, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - box.height - margin)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const sort = (order: SortOrder) => {
    request.sort(order);
    onClose();
  };
  const apply = () => {
    request.apply(shown);
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={m.column_filter_label()}
      style={{ left: place.left, top: place.top }}
      className="fixed z-30 flex w-64 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm shadow-lg"
    >
      <div className="flex flex-col">
        <Button
          variant="ghost"
          className="justify-start"
          aria-pressed={request.sorted === "ascending"}
          onClick={() => sort("ascending")}
        >
          <ArrowDownAZ size={15} />
          {m.column_filter_sort_ascending()}
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          aria-pressed={request.sorted === "descending"}
          onClick={() => sort("descending")}
        >
          <ArrowDownZA size={15} />
          {m.column_filter_sort_descending()}
        </Button>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <fieldset
        aria-label={m.column_filter_values()}
        className="m-0 flex max-h-60 flex-col overflow-auto border-0 p-0"
      >
        <label className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-[var(--muted)]">
          <input
            type="checkbox"
            checked={all}
            ref={(input) => {
              if (input) input.indeterminate = !all && !none;
            }}
            onChange={() => setShown(shown.map(() => !all))}
          />
          {m.column_filter_select_all()}
        </label>
        {request.values.map((value, index) => (
          <label
            // Values repeat only in case; the index keeps them apart.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list does not change while it is open
            key={index}
            className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-[var(--muted)]"
          >
            <input
              type="checkbox"
              checked={shown[index] ?? true}
              onChange={() => setShown(shown.map((on, other) => (other === index ? !on : on)))}
            />
            <span className="truncate">{value.text || EMPTY()}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{m.common_cancel()}</Button>
        <Button variant="primary" disabled={none} onClick={apply}>
          {m.common_ok()}
        </Button>
      </div>
    </div>
  );
};

/** The filter a click on a column's button asks for, placed in the window; null while none is open. */
export const useColumnFilter = (
  editor: Pick<SheetEditor, "onFilter"> | null,
  container: RefObject<HTMLDivElement | null>,
  readOnly: boolean,
) => {
  const [open, setOpen] = useState<{ request: FilterRequest; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!editor || readOnly) return;
    return editor.onFilter((request) => setOpen({ request, ...frameToWindow(container.current, request) }));
  }, [editor, readOnly, container]);
  return { open, close: () => setOpen(null) };
};
