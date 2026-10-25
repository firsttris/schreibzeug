import type { MailMergeCommands } from "@schreibzeug/editor-core";
import { useState } from "react";
import { mergedNameFor, missingFields, type Recipients } from "./mail-merge";
import type { MailMergeBarProps } from "./mail-merge-bar";
import { MIME } from "./opened-file";

type UseMailMerge = {
  mailMerge: MailMergeCommands | null;
  name: string;
  /** Stores a file beside the document and resolves with its name (edit-page.tsx createFile). */
  onCreateFile: ((name: string, bytes: Uint8Array, type: string) => Promise<string>) | undefined;
  notify: (message: string) => void;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The mail merge of a text document: which recipients, the preview, and the letters as a new
 * document beside it. The recipients live in this session only; the fields are in the document.
 */
export const useMailMerge = ({ mailMerge, name, onCreateFile, notify }: UseMailMerge) => {
  const [recipients, setRecipients] = useState<Recipients | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const checkFields = (current: Recipients) =>
    setMissing(missingFields(mailMerge?.fieldsInDocument() ?? [], current));

  const choose = (chosen: Recipients) => {
    if (!mailMerge) return;
    mailMerge.endPreview();
    setPreviewing(null);
    mailMerge.setRecipients(chosen.rows);
    setRecipients(chosen);
    checkFields(chosen);
  };

  const preview = (index: number | null) => {
    if (!mailMerge) return;
    if (index === null) mailMerge.endPreview();
    else mailMerge.preview(index);
    setPreviewing(index);
  };

  const create = async () => {
    if (!mailMerge || !recipients || !onCreateFile) return;
    setBusy(true);
    try {
      const bytes = await mailMerge.mergedDocx();
      const saved = await onCreateFile(mergedNameFor(name), bytes, MIME.docx);
      const count = recipients.rows.length - 1;
      notify(`${count} ${count === 1 ? "Brief" : "Briefe"} als „${saved}“ gespeichert.`);
    } catch (error) {
      notify(`Der Serienbrief konnte nicht erstellt werden: ${message(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const bar: MailMergeBarProps | null = recipients && {
    recipients,
    missing,
    previewing,
    busy,
    onInsert: (field) => {
      mailMerge?.insertField(field);
      checkFields(recipients);
    },
    onPreview: preview,
    onCreate: () => void create(),
    onClose: () => {
      preview(null);
      setRecipients(null);
    },
  };

  return {
    bar,
    choosing,
    choose,
    menu: {
      ready: mailMerge !== null && onCreateFile !== undefined,
      hasRecipients: recipients !== null,
      previewing: previewing !== null,
      onChoose: () => setChoosing(true),
      onTogglePreview: () => preview(previewing === null ? 0 : null),
      onCreate: () => void create(),
    },
    closeChooser: () => setChoosing(false),
  };
};
