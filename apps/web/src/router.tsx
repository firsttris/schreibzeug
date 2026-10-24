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
import { InvitePage } from "./account/invite-page";
import { LoginPage } from "./account/login-page";
import type { Account } from "./api/account";
import { EditPage } from "./editor/edit-page";
import { FolderPage } from "./files/folder-page";
import { RecentPage } from "./files/recent-page";
import { SharedPage } from "./files/shared-page";
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
  validateSearch: z.object({
    redirect: z.string().optional(),
    invite: z.string().optional(),
    mode: z.enum(["signIn", "signUp"]).optional(),
  }),
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(context.account.session)) throw redirect({ to: "/" });
  },
  component: () => {
    const { redirect, invite, mode } = loginRoute.useSearch();
    return <LoginPage redirect={redirect} invite={invite} mode={mode} />;
  },
});

/** A link someone shared: readable before signing in, accepted after (account/invite-page.tsx). */
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: () => <InvitePage token={inviteRoute.useParams().token} />,
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

const sharedRoute = createRoute({ getParentRoute: () => shellRoute, path: "/shared", component: SharedPage });

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
  inviteRoute,
  signedInRoute.addChildren([
    shellRoute.addChildren([homeRoute, folderRoute, recentRoute, sharedRoute, trashRoute]),
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
