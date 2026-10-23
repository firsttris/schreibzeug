import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApiClient } from "./api/client";
import { createFiles, FilesProvider } from "./api/context";
import { createAppRouter } from "./router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
// The web app talks to the server it was loaded from; the desktop app will pass a configured one.
const files = createFiles(createApiClient(window.location.origin));
const router = createAppRouter(queryClient);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FilesProvider files={files}>
        <RouterProvider router={router} />
      </FilesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
