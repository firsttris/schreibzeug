import { accessTokenSchema, type CreateAccessToken, createdAccessTokenSchema } from "@schreibzeug/files-api";
import { queryOptions } from "@tanstack/react-query";
import { type ApiClient, expectJson, expectOk } from "./client";

export const tokenKeys = { all: ["tokens"] as const };

/** The signed-in user's personal access tokens (apps/server src/auth/token-routes.ts). */
export const tokenApi = (api: ApiClient) => ({
  list: () =>
    queryOptions({
      queryKey: tokenKeys.all,
      queryFn: () => expectJson(api.tokens.$get(), accessTokenSchema.array()),
    }),
  create: (input: CreateAccessToken) =>
    expectJson(api.tokens.$post({ json: input }), createdAccessTokenSchema),
  revoke: (id: string) => expectOk(api.tokens[":id"].$delete({ param: { id } })),
});

export type TokenApi = ReturnType<typeof tokenApi>;

/** The command that connects Claude Code to this server (docs/mcp.md). */
export const claudeCommand = (mcpUrl: string, token: string): string =>
  `claude mcp add --transport http schreibzeug ${mcpUrl} --header "Authorization: Bearer ${token}"`;
