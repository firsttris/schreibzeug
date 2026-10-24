import { type ReactNode, useEffect, useRef } from "react";

export type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Room for a row of controls, e.g. the share dialog. */
  wide?: boolean;
  children: ReactNode;
};

/**
 * A modal on the native <dialog>: focus trap, Escape and the backdrop come from the browser, so the
 * dialog stays accessible without a library.
 */
export const Dialog = ({ open, title, onClose, wide = false, children }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click closes on the backdrop; the keyboard closes with Escape, which <dialog> handles
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto ${wide ? "w-[min(32rem,calc(100%-2rem))]" : "w-[min(26rem,calc(100%-2rem))]"} rounded-xl border border-[var(--border)] bg-[var(--background)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/40`}
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base font-semibold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
};
