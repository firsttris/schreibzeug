import type { ApiError, ApiErrorKind } from "@stapel/files-api";

/** Expected failures are values; only bugs and outages throw. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T = never>(kind: ApiErrorKind, message: string): Result<T> => ({
  ok: false,
  error: { kind, message },
});

export const statusOf = (kind: ApiErrorKind) =>
  (
    ({
      not_found: 404,
      name_taken: 409,
      conflict: 409,
      invalid: 400,
      not_a_folder: 422,
      too_large: 413,
      internal: 500,
    }) as const
  )[kind];
