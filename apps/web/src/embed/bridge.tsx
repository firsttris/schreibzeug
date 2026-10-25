import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useAccount } from "../account/context";
import type { Embed } from "./embed";
import { isAppPath, isKontextShortcut, readMessage } from "./messages";

const EmbedContext = createContext<Embed | null>(null);

export const EmbedProvider = ({ embed, children }: { embed: Embed; children: ReactNode }) => (
  <EmbedContext.Provider value={embed}>{children}</EmbedContext.Provider>
);

export const useEmbed = (): Embed => {
  const embed = useContext(EmbedContext);
  if (!embed) throw new Error("useEmbed needs an EmbedProvider");
  return embed;
};

/** Light or dark as Kontext shows it, from now on instead of the device's setting (index.html). */
const applyTheme = (theme: "light" | "dark") => {
  const root = document.documentElement;
  root.dataset.themeSource = "kontext";
  root.dataset.theme = theme;
};

/** A field the keys belong to, not Kontext. */
const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The talk with Kontext while embedded: which page is shown, Kontext's theme, its back button and
 * links, its sign-out, and its module keys pressed here. Mounted once inside the router.
 */
export const EmbedBridge = () => {
  const embed = useEmbed();
  const router = useRouter();
  const account = useAccount();
  const queryClient = useQueryClient();
  const href = useRouterState({ select: (state) => state.location.href });

  useEffect(() => {
    if (embed.embedded) embed.post({ source: "schreibzeug", type: "ready" });
  }, [embed]);

  useEffect(() => {
    if (embed.embedded) embed.post({ source: "schreibzeug", type: "route", path: href });
  }, [embed, href]);

  useEffect(() => {
    const { origin } = embed;
    if (!origin) return;
    const receive = (event: MessageEvent) => {
      const message = readMessage(event, { origin, parent: window.parent });
      if (!message) return;
      if (message.type === "theme") applyTheme(message.theme);
      else if (message.type === "navigate" && isAppPath(message.path)) router.history.push(message.path);
      else if (message.type === "logout") {
        embed.signedOut();
        void account
          .signOut()
          .catch(() => undefined)
          .then(() => {
            embed.post({ source: "schreibzeug", type: "signed-out" });
            queryClient.clear();
            return router.navigate({ to: "/login" });
          });
      }
    };
    const forward = (event: KeyboardEvent) => {
      if (isEditable(event.target) || !isKontextShortcut(event)) return;
      embed.post({ source: "schreibzeug", type: "shortcut", key: event.key });
    };
    window.addEventListener("message", receive);
    window.addEventListener("keydown", forward);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("keydown", forward);
    };
  }, [embed, router, account, queryClient]);

  return null;
};

/** Tells Kontext the name of the open document, and that none is open when the page goes. */
export const useReportTitle = (title: string) => {
  const embed = useEmbed();
  useEffect(() => {
    if (!embed.embedded) return;
    embed.post({ source: "schreibzeug", type: "title", title });
    return () => embed.post({ source: "schreibzeug", type: "title", title: null });
  }, [embed, title]);
};

/** Tells Kontext whether there are changes the server does not have yet. */
export const useReportUnsaved = (unsaved: boolean) => {
  const embed = useEmbed();
  useEffect(() => {
    if (!embed.embedded) return;
    embed.post({ source: "schreibzeug", type: "unsaved", unsaved });
    return () => embed.post({ source: "schreibzeug", type: "unsaved", unsaved: false });
  }, [embed, unsaved]);
};
