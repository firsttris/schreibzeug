import { useQuery } from "@tanstack/react-query";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { m } from "../paraglide/messages";
import { NodeActions } from "./node-actions";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";

/** Files by their last change, wherever they are. */
export const RecentPage = () => {
  const { queries } = useFiles();
  const recent = useQuery(queries.recent());
  return (
    <section className="flex flex-col gap-4" aria-label={m.recent_page_title()}>
      <PageHeader title={m.recent_page_title()} />
      {recent.isPending && <PageMessage>{m.recent_page_loading()}</PageMessage>}
      {recent.isError && <PageMessage tone="error">{messageOf(recent.error)}</PageMessage>}
      {recent.data && (
        <NodeTable
          nodes={recent.data}
          actions={(node) => <NodeActions node={node} />}
          empty={m.recent_page_empty()}
        />
      )}
    </section>
  );
};
