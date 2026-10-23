import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { EditPage } from "./edit-page";
import { FolderPage } from "./files/folder-page";
import { RecentPage } from "./files/recent-page";
import { TrashPage } from "./files/trash-page";
import { Shell } from "./shell";

/**
 * Routes in code rather than generated from files: a handful of pages, and no generated route
 * tree to keep in sync. The editor has the whole window; the file pages share the shell.
 */
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="flex flex-col items-start gap-3 p-8 text-sm">
      <p className="m-0">Diese Seite gibt es nicht.</p>
      <Link to="/">Zu meinen Dateien</Link>
    </div>
  ),
});

const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: "shell", component: Shell });

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: () => <FolderPage folderId={null} />,
});

const folderRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/folders/$folderId",
  component: () => {
    const { folderId } = folderRoute.useParams();
    return <FolderPage key={folderId} folderId={folderId} />;
  },
});

const recentRoute = createRoute({ getParentRoute: () => shellRoute, path: "/recent", component: RecentPage });

const trashRoute = createRoute({ getParentRoute: () => shellRoute, path: "/trash", component: TrashPage });

const editRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/edit/$fileId",
  component: () => {
    const { fileId } = editRoute.useParams();
    return <EditPage key={fileId} fileId={fileId} />;
  },
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([homeRoute, folderRoute, recentRoute, trashRoute]),
  editRoute,
]);

export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
