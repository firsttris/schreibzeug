import { useQuery } from "@tanstack/react-query";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { m } from "../paraglide/messages";
import { NodeActions } from "./node-actions";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";

const DETAIL = {
  edit: m.shared_page_detail_edit,
  view: m.shared_page_detail_view,
  owner: m.shared_page_detail_edit,
} as const;

/** What others shared with the signed-in user, with whose it is and what they may do with it. */
export const SharedPage = () => {
  const { queries } = useFiles();
  const shared = useQuery(queries.shared());
  return (
    <section className="flex flex-col gap-4" aria-label={m.shared_page_title()}>
      <PageHeader title={m.shared_page_title()} />
      {shared.isPending && <PageMessage>{m.shared_page_loading()}</PageMessage>}
      {shared.isError && <PageMessage tone="error">{messageOf(shared.error)}</PageMessage>}
      {shared.data && (
        <NodeTable
          nodes={shared.data}
          actions={(node) => <NodeActions node={node} renamable={false} />}
          detail={(node) => DETAIL[node.role]({ owner: node.ownerName })}
          empty={m.shared_page_empty()}
        />
      )}
    </section>
  );
};
