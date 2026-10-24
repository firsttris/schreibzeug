import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountProvider } from "./account/context";
import { createAccount } from "./api/account";
import { createApiClient, isApiFailure } from "./api/client";
import { createFiles, FilesProvider, fetchServerInfo } from "./api/context";
import { createAppRouter } from "./router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The web app talks to the server it was loaded from; the desktop app will pass a configured one.
const origin = window.location.origin;
const account = createAccount(origin);
const files = createFiles(createApiClient(origin), origin, await fetchServerInfo(origin));

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
const router = createAppRouter({ queryClient, account });

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccountProvider account={account}>
        <FilesProvider files={files}>
          <RouterProvider router={router} />
        </FilesProvider>
      </AccountProvider>
    </QueryClientProvider>
  </StrictMode>,
);
