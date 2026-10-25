import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type InputHTMLAttributes, useState } from "react";
import { useFiles } from "../api/context";
import { Button } from "../ui/button";
import { Brand } from "./brand";
import { useAccount } from "./context";

export type Mode = "signIn" | "signUp";

export type LoginPageProps = {
  /** Where to go afterwards, a path in the app. */
  redirect: string | undefined;
  /** The token of a link someone came with: it lets them create an account when sign-up is closed. */
  invite?: string | undefined;
  mode?: Mode | undefined;
  /**
   * The sign-in through the provider found an account with a password for the address: signing in
   * with the password connects the provider to it right after.
   */
  linkProvider?: boolean | undefined;
};

const Field = ({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="flex flex-col gap-1.5 text-sm">
    <span className="font-medium">{label}</span>
    <input
      required
      className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)]"
      {...input}
    />
  </label>
);

/** "Anmelden mit Kontext": the way in with the company account, when the server has it. */
const ProviderSignIn = ({ name, redirect }: { name: string; redirect: string | undefined }) => {
  const account = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = redirect?.startsWith("/") ? redirect : "/";
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await account.signInWithProvider({
        callbackURL: target,
        errorCallbackURL: `/login?redirect=${encodeURIComponent(target)}`,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button disabled={busy} onClick={() => void signIn()}>
        Anmelden mit {name}
      </Button>
      {error && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="m-0 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        oder mit E-Mail
        <span className="h-px flex-1 bg-[var(--border)]" />
      </p>
    </div>
  );
};

/**
 * Signing in and creating an account on one page. After either, the session is read again and
 * the person lands where they wanted to go.
 */
export const LoginPage = ({
  redirect,
  invite,
  mode: initialMode = "signIn",
  linkProvider = false,
}: LoginPageProps) => {
  const account = useAccount();
  const { info } = useFiles();
  const provider = info.mode === "server" ? info.oidc : undefined;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connect = Boolean(provider && linkProvider) && mode === "signIn";

  const submit = async (form: FormData) => {
    const field = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signIn")
        await account.signIn({ email: field("email"), password: String(form.get("password")) });
      else
        await account.signUp(
          { name: field("name"), email: field("email"), password: String(form.get("password")) },
          invite,
        );
      const target = redirect?.startsWith("/") ? redirect : "/";
      if (connect) {
        await account.linkProvider({
          callbackURL: target,
          errorCallbackURL: `/login?redirect=${encodeURIComponent(target)}`,
        });
        return;
      }
      await queryClient.resetQueries({ queryKey: account.session.queryKey });
      await navigate({ to: target });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const signingUp = mode === "signUp";
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Brand />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold">{signingUp ? "Konto anlegen" : "Anmelden"}</h1>
          <p className="m-0 text-sm text-[var(--muted-foreground)]">
            {signingUp
              ? "Mit deinem Namen sehen dich die anderen beim Bearbeiten."
              : "Melde dich mit deiner E-Mail an."}
          </p>
        </div>
        {connect && provider ? (
          <p role="status" className="m-0 rounded-md border border-[var(--border)] p-3 text-sm">
            Für diese Adresse gibt es hier schon ein Konto mit Passwort. Melde dich damit an, dann wird es mit{" "}
            {provider.name} verbunden.
          </p>
        ) : (
          provider && !signingUp && <ProviderSignIn name={provider.name} redirect={redirect} />
        )}
        <form
          key={mode}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          {signingUp && <Field label="Name" name="name" autoComplete="name" />}
          <Field label="E-Mail" name="email" type="email" autoComplete="email" />
          <Field
            label="Passwort"
            name="password"
            type="password"
            minLength={signingUp ? 8 : undefined}
            autoComplete={signingUp ? "new-password" : "current-password"}
          />
          {error && (
            <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {signingUp ? "Konto anlegen" : "Anmelden"}
          </Button>
        </form>
        <p className="m-0 text-sm text-[var(--muted-foreground)]">
          {signingUp ? "Schon ein Konto?" : "Noch kein Konto?"}{" "}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 font-medium text-[var(--foreground)] underline"
            onClick={() => {
              setMode(signingUp ? "signIn" : "signUp");
              setError(null);
            }}
          >
            {signingUp ? "Anmelden" : "Konto anlegen"}
          </button>
        </p>
      </div>
    </main>
  );
};
