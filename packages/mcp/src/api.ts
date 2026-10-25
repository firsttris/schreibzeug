import { apiErrorSchema } from "@schreibzeug/files-api";
import type { z } from "zod";

/**
 * The files API as the tools reach it: a fetch for paths under /api that carries the caller's
 * credentials. The server passes its own app (`app.request`), so a tool does exactly what the same
 * request from the interface would do, with the same checks, and there is no second logic.
 */
export type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** Expected failures are values (a German message for the client), as in the server. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

export const success = <T>(value: T): Outcome<T> => ({ ok: true, value });
export const failure = <T = never>(message: string): Outcome<T> => ({ ok: false, message });

const UNEXPECTED = (status: number) =>
  status === 404 || status === 405
    ? "Das kann dieser Server nicht."
    : `Der Server antwortet nicht wie erwartet (HTTP ${status}).`;

const messageOf = async (reply: Response): Promise<string> => {
  const parsed = apiErrorSchema.safeParse(await reply.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : UNEXPECTED(reply.status);
};

/** A JSON reply checked against the shared schema; a failed one becomes its message. */
export const json = async <S extends z.ZodType>(
  reply: Promise<Response>,
  schema: S,
): Promise<Outcome<z.infer<S>>> => {
  const response = await reply;
  if (!response.ok) return failure(await messageOf(response));
  const parsed = schema.safeParse(await response.json().catch(() => null));
  return parsed.success ? success(parsed.data) : failure(UNEXPECTED(response.status));
};

/** The bytes of a reply. */
export const bytes = async (reply: Promise<Response>): Promise<Outcome<Uint8Array>> => {
  const response = await reply;
  if (!response.ok) return failure(await messageOf(response));
  return success(new Uint8Array(await response.arrayBuffer()));
};

/** A request with a JSON body. */
export const withJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** An upload as the interface sends it (multipart, `file` and `parentId`). */
export const withFile = (name: string, content: Uint8Array, parentId: string | null): RequestInit => {
  const form = new FormData();
  form.append("file", new File([content as Uint8Array<ArrayBuffer>], name));
  if (parentId) form.append("parentId", parentId);
  return { method: "POST", body: form };
};

/** A new version of a file from its bytes. */
export const withBytes = (content: Uint8Array): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/octet-stream" },
  body: content as Uint8Array<ArrayBuffer>,
});

/** The value of an outcome turned into something else; a failure stays as it is. */
export const mapOutcome = <T, R>(outcome: Outcome<T>, map: (value: T) => R): Outcome<R> =>
  outcome.ok ? success(map(outcome.value)) : outcome;
