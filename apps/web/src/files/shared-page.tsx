import { useQuery } from "@tanstack/react-query";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { NodeActions } from "./node-actions";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";

const ROLE_TEXT = { edit: "bearbeiten", view: "ansehen", owner: "bearbeiten" } as const;

/** What others shared with the signed-in user, with whose it is and what they may do with it. */
export const SharedPage = () => {
  const { queries } = useFiles();
  const shared = useQuery(queries.shared());
  return (
    <section className="flex flex-col gap-4" aria-label="Für mich freigegeben">
      <PageHeader title="Für mich freigegeben" />
      {shared.isPending && <PageMessage>Lädt …</PageMessage>}
      {shared.isError && <PageMessage tone="error">{messageOf(shared.error)}</PageMessage>}
      {shared.data && (
        <NodeTable
          nodes={shared.data}
          actions={(node) => <NodeActions node={node} renamable={false} />}
          detail={(node) => `von ${node.ownerName} · darf ${ROLE_TEXT[node.role]}`}
          empty="Noch hat niemand etwas mit dir geteilt."
        />
      )}
    </section>
  );
};
