import { ChevronDown } from "lucide-react";

export type ChoiceProps = {
  label: string;
  /** The current value; null when the selection mixes several. */
  value: string | null;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
};

/**
 * A native select in the toolbar's look. Native, so the keyboard, type-ahead and long lists (all
 * the engine's fonts) work everywhere without a library. A value that is not among the options
 * (a font the document names but the engine lacks) is still shown.
 */
export const Choice = ({ label, value, options, disabled, onChange, className = "" }: ChoiceProps) => {
  const known = value === null || options.some((option) => option.value === value);
  return (
    <span className={`relative inline-flex h-8 items-center ${className}`}>
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full appearance-none truncate rounded-md border border-[var(--border)] bg-[var(--background)] pr-7 pl-2.5 text-sm text-[var(--foreground)] outline-none focus-visible:border-[var(--foreground)] disabled:opacity-40"
      >
        {value === null && <option value="">–</option>}
        {!known && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2 text-[var(--muted-foreground)]"
      />
    </span>
  );
};
