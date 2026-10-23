import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { UserProvider } from "./account/context";
import { LoginPage } from "./account/login-page";
import type { Account } from "./api/account";
import { EditPage } from "./editor/edit-page";
import { FolderPage } from "./files/folder-page";
import { RecentPage } from "./files/recent-page";
import { TrashPage } from "./files/trash-page";
import { Shell } from "./shell";

/**
 * Routes in code rather than generated from files: a handful of pages, and no generated route
 * tree to keep in sync. The editor has the whole window; the file pages share the shell.
 */
export type RouterContext = { queryClient: QueryClient; account: Account };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="flex flex-col items-start gap-3 p-8 text-sm">
      <p className="m-0">Diese Seite gibt es nicht.</p>
      <Link to="/">Zu meinen Dateien</Link>
    </div>
  ),
});

/** Every page but the sign-in needs a session; without one it sends you there and back after. */
const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "signed-in",
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(context.account.session);
    if (!user) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { user };
  },
  component: () => {
    const { user } = signedInRoute.useRouteContext();
    return (
      <UserProvider user={user}>
        <Outlet />
      </UserProvider>
    );
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(context.account.session)) throw redirect({ to: "/" });
  },
  component: () => <LoginPage redirect={loginRoute.useSearch().redirect} />,
});

const shellRoute = createRoute({ getParentRoute: () => signedInRoute, id: "shell", component: Shell });

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
  getParentRoute: () => signedInRoute,
  path: "/edit/$fileId",
  component: () => {
    const { fileId } = editRoute.useParams();
    return <EditPage key={fileId} fileId={fileId} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signedInRoute.addChildren([
    shellRoute.addChildren([homeRoute, folderRoute, recentRoute, trashRoute]),
    editRoute,
  ]),
]);

export const createAppRouter = (context: RouterContext) =>
  createRouter({ routeTree, context, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
