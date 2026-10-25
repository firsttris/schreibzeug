import type { ReactNode } from "react";

export const inputClass =
  "h-8 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--foreground)]";

/** A labelled input; the label names it for assistive technology and the tests. */
export const Field = ({
  label,
  value,
  onChange,
  type = "text",
  className = "",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "email";
  className?: string;
  placeholder?: string;
}) => (
  <label className={`flex min-w-0 flex-col gap-1 text-xs ${className}`}>
    <span className="text-[var(--muted-foreground)]">{label}</span>
    <input
      className={inputClass}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

/** A group of fields with its heading, a fieldset so its fields are found by the group's name. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
    <legend className="mb-1 p-0 text-sm font-medium">{title}</legend>
    {children}
  </fieldset>
);
