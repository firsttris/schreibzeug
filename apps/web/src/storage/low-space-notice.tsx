import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useFiles } from "../api/context";
import { formatSize } from "../lib/format";
import { isLow } from "../lib/storage";

/** Says so before a save fails: the drive holding the files has hardly any room left. */
export const LowSpaceNotice = () => {
  const { queries, info } = useFiles();
  const { data } = useQuery(queries.storage());
  if (!data?.disk || !isLow(data)) return null;
  const where = info.mode === "local" ? "Auf diesem Computer" : "Auf dem Server";
  return (
    <p
      role="alert"
      className="m-0 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <span>
        {where} ist kaum noch Platz: {formatSize(data.disk.free)} frei. Speichern und Hochladen können bald
        scheitern.
        {info.mode === "server" && " Sag der Person Bescheid, die den Server betreut."}
      </span>
    </p>
  );
};
