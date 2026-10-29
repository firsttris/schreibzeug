import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountProvider } from "./account/context";
import { createAccount } from "./api/account";
import { createApiClient, isApiFailure } from "./api/client";
import { createFiles, FilesProvider, fetchServerInfo } from "./api/context";
import { EmbedProvider } from "./embed/bridge";
import { createEmbed } from "./embed/embed";
import { getLocale } from "./paraglide/runtime";
import { createAppRouter } from "./router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

// The demo answers /api in the page (src/demo), before the first request. Written out, not as a
// shared constant: Vite replaces it, so other builds leave the demo out entirely.
const demo = import.meta.env.MODE === "demo" ? await import("./demo/install") : null;

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// The page in the language of its texts (index.html says German), for screen readers and hyphenation.
document.documentElement.lang = getLocale();

// The web app talks to the server it was loaded from; the desktop app will pass a configured one.
const origin = window.location.origin;
const account = createAccount(origin);
const info = await fetchServerInfo(origin);
const files = createFiles(createApiClient(origin), origin, info, demo ? { mediaUrl: demo.mediaUrl } : {});
const embed = createEmbed(info.mode === "server" ? info.embedOrigin : undefined);
const oidc = info.mode === "server" && Boolean(info.oidc);

/** A request the server refused for want of a session: the session ended, so sign in again. */
const onRequestError = (error: unknown) => {
  if (!isApiFailure(error) || error.status !== 401) return;
  queryClient.setQueryData(account.session.queryKey, null);
  void router.navigate({ to: "/login", search: { redirect: router.state.location.href } });
};
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
  queryCache: new QueryCache({ onError: onRequestError }),
  mutationCache: new MutationCache({ onError: onRequestError }),
});
const router = createAppRouter(
  { queryClient, account, embed, oidc },
  // The demo is static files under a path of GitHub Pages: the route lives after the "#".
  import.meta.env.MODE === "demo" ? createHashHistory() : undefined,
);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccountProvider account={account}>
        <FilesProvider files={files}>
          <EmbedProvider embed={embed}>
            <RouterProvider router={router} />
          </EmbedProvider>
        </FilesProvider>
      </AccountProvider>
    </QueryClientProvider>
  </StrictMode>,
);
