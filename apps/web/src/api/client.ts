import { type ApiError, apiErrorSchema } from "@stapel/files-api";
import type { AppType } from "@stapel/server";
import { hc } from "hono/client";
import type { z } from "zod";

/**
 * The typed client for the Stapel server. Its routes and request bodies come from the server's own
 * types (`AppType`), so a changed route breaks the build here, not at run time.
 */
export const createApiClient = (baseUrl: string) => hc<AppType>(baseUrl).api;

export type ApiClient = ReturnType<typeof createApiClient>;

/** A failed request as an Error, so TanStack Query treats it as one; `error` says what went wrong. */
export type ApiFailure = Error & { status: number; error: ApiError };

export const isApiFailure = (value: unknown): value is ApiFailure =>
  value instanceof Error && "error" in value && "status" in value;

type Reply = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const failure = async (reply: Reply): Promise<ApiFailure> => {
  const parsed = apiErrorSchema.safeParse(await reply.json().catch(() => null));
  const error: ApiError = parsed.success
    ? parsed.data.error
    : { kind: "internal", message: `Der Server antwortet nicht wie erwartet (HTTP ${reply.status}).` };
  return Object.assign(new Error(error.message), { status: reply.status, error });
};

/**
 * The body of a successful reply, checked against the shared schema, so server and client that
 * drift apart fail loudly; a failed reply becomes an `ApiFailure`.
 */
export const expectJson = async <S extends z.ZodType>(
  reply: Promise<Reply>,
  schema: S,
): Promise<z.infer<S>> => {
  const response = await reply;
  if (!response.ok) throw await failure(response);
  return schema.parse(await response.json());
};

export const expectBytes = async (reply: Promise<Reply>): Promise<Uint8Array> => {
  const response = await reply;
  if (!response.ok) throw await failure(response);
  return new Uint8Array(await response.arrayBuffer());
};

/** The message to show for anything a request threw. */
export const messageOf = (error: unknown): string =>
  isApiFailure(error) ? error.error.message : "Der Server ist nicht erreichbar.";
