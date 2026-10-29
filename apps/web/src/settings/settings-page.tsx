import { useFiles } from "../api/context";
import { PageHeader } from "../files/page";
import { m } from "../paraglide/messages";
import { AccessTokens } from "./access-tokens";
import { LanguageSection } from "./language-section";
import { StorageSection } from "./storage-section";

/** The person's settings: the language, and on a Schreibzeug server the room their files take and the access tokens. */
export const SettingsPage = () => {
  const { info } = useFiles();
  return (
    <section className="flex flex-col gap-6" aria-label={m.settings_title()}>
      <PageHeader title={m.settings_title()} />
      <LanguageSection />
      {info.mode === "server" && (
        <>
          <StorageSection />
          <AccessTokens />
        </>
      )}
    </section>
  );
};
