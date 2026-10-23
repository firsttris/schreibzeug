import { useQuery } from "@tanstack/react-query";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { NodeActions } from "./node-actions";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";

/** Files by their last change, wherever they are. */
export const RecentPage = () => {
  const { queries } = useFiles();
  const recent = useQuery(queries.recent());
  return (
    <section className="flex flex-col gap-4" aria-label="Zuletzt">
      <PageHeader title="Zuletzt" />
      {recent.isPending && <PageMessage>Lädt …</PageMessage>}
      {recent.isError && <PageMessage tone="error">{messageOf(recent.error)}</PageMessage>}
      {recent.data && (
        <NodeTable
          nodes={recent.data}
          actions={(node) => <NodeActions node={node} />}
          empty="Noch keine Dateien. Lade etwas hoch oder lege ein Dokument an."
        />
      )}
    </section>
  );
};
