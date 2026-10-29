import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileOutput } from "lucide-react";
import { useState } from "react";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { copyNameFor, legacyPlanOf } from "./convert";
import { newConverter } from "./engine";
import { MIME, type OpenedFile } from "./opened-file";

type ConvertPageProps = {
  file: OpenedFile & { parentId: string | null; owned: boolean };
  name: string;
  onClose: () => void;
};

/**
 * A file in an older format (Word, Excel or PowerPoint 97–2003, RTF): x2t reads it but cannot write
 * it back, so Schreibzeug makes a copy in the Office format beside it, opens that, and leaves the
 * file itself as it is, as Word does with "Konvertieren".
 */
export const ConvertPage = ({ file, name, onClose }: ConvertPageProps) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const plan = legacyPlanOf(file.name);
  if (!plan) return null;
  // Someone the file is shared with may not write in its folder; the copy goes to their own files.
  const parentId = file.owned ? file.parentId : null;

  const convert = async () => {
    setBusy(true);
    setFailure(null);
    const converter = newConverter();
    try {
      const converted = await converter.convert(file.bytes, plan.from, plan.to);
      const folder = await queryClient.fetchQuery(queries.folder(parentId));
      const taken = new Set(folder.children.map((child) => child.name));
      const copyName = copyNameFor(name, plan.to, taken);
      const created = await commands.upload(
        parentId,
        new File([converted.bytes as BlobPart], copyName, { type: MIME[plan.to] }),
      );
      await refreshFiles(queryClient);
      await navigate({ to: "/edit/$fileId", params: { fileId: created.id } });
    } catch (error) {
      setFailure(m.convert_page_failed({ error: error instanceof Error ? error.message : String(error) }));
      setBusy(false);
    } finally {
      converter.terminate();
    }
  };

  const explain = file.owned ? m.convert_page_explain_beside : m.convert_page_explain_yours;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8 text-sm">
      <FileOutput size={28} className="text-[var(--muted-foreground)]" aria-hidden />
      <h1 className="m-0 text-lg font-semibold">{name}</h1>
      <p className="m-0">{explain({ format: plan.label, to: plan.to, name })}</p>
      {failure && (
        <p role="alert" className="m-0 text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void convert()}>
          {busy ? m.convert_page_converting() : m.convert_page_open_as({ to: plan.to })}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {m.common_back()}
        </Button>
      </div>
    </div>
  );
};
