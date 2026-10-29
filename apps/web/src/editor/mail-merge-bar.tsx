import { ChevronLeft, ChevronRight, Mails, X } from "lucide-react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import type { Recipients } from "./mail-merge";

export type MailMergeBarProps = {
  recipients: Recipients;
  /** Fields the document uses that the recipients lack. */
  missing: string[];
  /** The recipient shown, from 0, or null while the template is shown. */
  previewing: number | null;
  busy: boolean;
  onInsert: (name: string) => void;
  onPreview: (index: number | null) => void;
  onCreate: () => void;
  onClose: () => void;
};

/**
 * Above the letter while a mail merge is set up: the recipients, their fields to put in at the
 * cursor, the letter for one recipient, and the letters for all.
 */
export const MailMergeBar = ({
  recipients,
  missing,
  previewing,
  busy,
  onInsert,
  onPreview,
  onCreate,
  onClose,
}: MailMergeBarProps) => {
  const [fields = [], ...rows] = recipients.rows;
  const count = rows.length;
  return (
    <section
      aria-label={m.mail_merge_bar_label()}
      className="flex flex-col gap-1.5 border-b border-[var(--border)] px-4 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Mails size={14} aria-hidden />
        <span className="font-medium">{m.mail_merge_bar_label()}</span>
        <span className="text-[var(--muted-foreground)]">
          {recipients.source} ·{" "}
          {count === 1 ? m.mail_merge_bar_count_one({ count }) : m.mail_merge_bar_count_other({ count })}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {previewing === null ? (
            <Button variant="ghost" onClick={() => onPreview(0)}>
              {m.mail_merge_bar_preview()}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                aria-label={m.mail_merge_bar_previous()}
                disabled={previewing === 0}
                onClick={() => onPreview(previewing - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <span role="status" className="tabular-nums">
                {m.mail_merge_bar_position({ index: previewing + 1, count })}
              </span>
              <Button
                variant="ghost"
                aria-label={m.mail_merge_bar_next()}
                disabled={previewing >= count - 1}
                onClick={() => onPreview(previewing + 1)}
              >
                <ChevronRight size={14} />
              </Button>
              <Button variant="ghost" onClick={() => onPreview(null)}>
                {m.mail_merge_bar_end_preview()}
              </Button>
            </>
          )}
          <Button variant="primary" disabled={busy} onClick={onCreate}>
            {busy ? m.mail_merge_bar_creating() : m.mail_merge_bar_create()}
          </Button>
          <Button variant="ghost" aria-label={m.mail_merge_bar_close()} onClick={onClose}>
            <X size={14} />
          </Button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[var(--muted-foreground)]">{m.mail_merge_bar_insert_field()}</span>
        {fields.map((name) => (
          <Button
            key={name}
            variant="outline"
            disabled={previewing !== null}
            aria-label={m.mail_merge_bar_insert_named({ name })}
            onClick={() => onInsert(name)}
          >
            «{name}»
          </Button>
        ))}
      </div>
      {missing.length > 0 && (
        <p role="alert" className="m-0 text-amber-700 dark:text-amber-400">
          {m.mail_merge_bar_missing({ fields: missing.map((name) => `«${name}»`).join(", ") })}
        </p>
      )}
    </section>
  );
};
