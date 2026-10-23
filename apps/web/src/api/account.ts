import { queryOptions } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/client";

/** The signed-in person, as the editor and the shell need them. */
export type User = { id: string; name: string; email: string };

/** Better Auth's error codes (better-auth core error codes) in the words the app uses. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-Mail oder Passwort stimmen nicht.",
  INVALID_EMAIL: "Das ist keine gültige E-Mail-Adresse.",
  PASSWORD_TOO_SHORT: "Das Passwort braucht mindestens 8 Zeichen.",
  PASSWORD_TOO_LONG: "Das Passwort ist zu lang.",
  USER_ALREADY_EXISTS: "Mit dieser E-Mail gibt es schon ein Konto.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Mit dieser E-Mail gibt es schon ein Konto.",
};

type AuthError = { code?: string | undefined; message?: string | undefined; status: number };

/** A failed sign-in or sign-up in German; our own server messages are German already. */
export const accountMessage = (error: AuthError): string =>
  (error.code && MESSAGES[error.code]) ||
  (error.status === 403 && error.message) ||
  "Das hat nicht geklappt. Bitte versuche es noch einmal.";

/** Thrown for a failed account request, with the message to show. */
const fail = (error: AuthError): never => {
  throw new Error(accountMessage(error));
};

/**
 * Accounts on the Stapel server: Better Auth's client against its routes under /api/auth
 * (apps/server src/auth). The session lives in a cookie; TanStack Query keeps who is signed in.
 */
export const createAccount = (baseUrl: string) => {
  const client = createAuthClient({ baseURL: baseUrl });

  const session = queryOptions({
    queryKey: ["account", "session"] as const,
    queryFn: async (): Promise<User | null> => {
      const { data, error } = await client.getSession();
      if (error) throw new Error(accountMessage(error));
      if (!data) return null;
      const { id, name, email } = data.user;
      return { id, name, email };
    },
    staleTime: 60_000,
  });

  return {
    session,
    signIn: async (input: { email: string; password: string }) => {
      const { error } = await client.signIn.email(input);
      if (error) fail(error);
    },
    signUp: async (input: { name: string; email: string; password: string }) => {
      const { error } = await client.signUp.email(input);
      if (error) fail(error);
    },
    signOut: async () => {
      const { error } = await client.signOut();
      if (error) fail(error);
    },
  };
};

export type Account = ReturnType<typeof createAccount>;
