import { useFiles } from "../api/context";
import { PageHeader, PageMessage } from "../files/page";
import { AccessTokens } from "./access-tokens";

/** The person's settings; for now the access tokens, which only a Schreibzeug server has. */
export const SettingsPage = () => {
  const { info } = useFiles();
  return (
    <section className="flex flex-col gap-6" aria-label="Einstellungen">
      <PageHeader title="Einstellungen" />
      {info.mode === "server" ? (
        <AccessTokens />
      ) : (
        <PageMessage>Für Dateien auf diesem Computer gibt es hier nichts einzustellen.</PageMessage>
      )}
    </section>
  );
};
