import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { type InputHTMLAttributes, useState } from "react";
import { Button } from "../ui/button";
import { useAccount } from "./context";

type Mode = "signIn" | "signUp";

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

/**
 * Signing in and creating an account on one page. After either, the session is read again and
 * the person lands where they wanted to go.
 */
export const LoginPage = ({ redirect }: { redirect: string | undefined }) => {
  const account = useAccount();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (form: FormData) => {
    const field = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signIn")
        await account.signIn({ email: field("email"), password: String(form.get("password")) });
      else
        await account.signUp({
          name: field("name"),
          email: field("email"),
          password: String(form.get("password")),
        });
      await queryClient.resetQueries({ queryKey: account.session.queryKey });
      await navigate({ to: redirect?.startsWith("/") ? redirect : "/" });
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
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Layers size={18} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Stapel</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold">{signingUp ? "Konto anlegen" : "Anmelden"}</h1>
          <p className="m-0 text-sm text-[var(--muted-foreground)]">
            {signingUp
              ? "Mit deinem Namen sehen dich die anderen beim Bearbeiten."
              : "Melde dich mit deiner E-Mail an."}
          </p>
        </div>
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
