import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "toggle";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "h-9 px-4 bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
  outline: "h-9 px-3 border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]",
  ghost:
    "h-8 min-w-8 px-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
  toggle:
    "h-8 min-w-8 px-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] " +
    "aria-pressed:bg-[var(--border)] aria-pressed:text-[var(--foreground)]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const Button = ({ variant = "outline", className = "", type = "button", ...props }: ButtonProps) => (
  <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />
);
