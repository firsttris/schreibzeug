import {
  type BlankFormat,
  type CreateInvite,
  type FileNode,
  folderListingSchema,
  ifMatchHeader,
  invitationSchema,
  inviteSchema,
  mediaSchema,
  nodeSchema,
  SESSION_SAVE_HEADER,
  type SessionSave,
  type ShareRole,
  sessionSaveHeader,
  sharedNodeSchema,
  shareSchema,
  type UpdateNode,
  versionSchema,
} from "@schreibzeug/files-api";
import { type QueryClient, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ApiClient, expectBytes, expectJson, expectOk } from "./client";

/** Query keys: everything about files sits under "files", so one invalidation refreshes every list. */
export const fileKeys = {
  all: ["files"] as const,
  folder: (folderId: string | null) => ["files", "folder", folderId ?? "root"] as const,
  node: (id: string) => ["files", "node", id] as const,
  recent: ["files", "recent"] as const,
  trash: ["files", "trash"] as const,
  shared: ["files", "shared"] as const,
  shares: (id: string) => ["files", "shares", id] as const,
  invites: (id: string) => ["files", "invites", id] as const,
  invitation: (token: string) => ["invitation", token] as const,
  versions: (id: string) => ["files", "versions", id] as const,
};

const nodeList = nodeSchema.array();
const shareList = shareSchema.array();

/** The reads, as query options, so routes and components share keys and fetchers. */
export const fileQueries = (api: ApiClient) => ({
  folder: (folderId: string | null) =>
    queryOptions({
      queryKey: fileKeys.folder(folderId),
      queryFn: () =>
        expectJson(api.nodes.$get({ query: { parent: folderId ?? "root" } }), folderListingSchema),
    }),
  node: (id: string) =>
    queryOptions({
      queryKey: fileKeys.node(id),
      queryFn: () => expectJson(api.nodes[":id"].$get({ param: { id } }), nodeSchema),
    }),
  recent: () =>
    queryOptions({ queryKey: fileKeys.recent, queryFn: () => expectJson(api.recent.$get(), nodeList) }),
  trash: () =>
    queryOptions({ queryKey: fileKeys.trash, queryFn: () => expectJson(api.trash.$get(), nodeList) }),
  shared: () =>
    queryOptions({
      queryKey: fileKeys.shared,
      queryFn: () => expectJson(api.shared.$get(), sharedNodeSchema.array()),
    }),
  shares: (id: string) =>
    queryOptions({
      queryKey: fileKeys.shares(id),
      queryFn: () => expectJson(api.nodes[":id"].shares.$get({ param: { id } }), shareList),
    }),
  invites: (id: string) =>
    queryOptions({
      queryKey: fileKeys.invites(id),
      queryFn: () => expectJson(api.nodes[":id"].invites.$get({ param: { id } }), inviteSchema.array()),
    }),
  /** What a link shares; readable without signing in. */
  invitation: (token: string) =>
    queryOptions({
      queryKey: fileKeys.invitation(token),
      queryFn: () => expectJson(api.invites[":token"].$get({ param: { token } }), invitationSchema),
      retry: false,
    }),
  versions: (id: string) =>
    queryOptions({
      queryKey: fileKeys.versions(id),
      queryFn: () => expectJson(api.files[":id"].versions.$get({ param: { id } }), versionSchema.array()),
    }),
});

/** The writes. Each returns the node it touched; the lists are refreshed afterwards. */
export const fileCommands = (api: ApiClient) => ({
  createFolder: (parentId: string | null, name: string) =>
    expectJson(api.folders.$post({ json: { parentId, name } }), nodeSchema),
  createBlank: (parentId: string | null, name: string, format: BlankFormat) =>
    expectJson(api.files.blank.$post({ json: { parentId, name, format } }), nodeSchema),
  upload: (parentId: string | null, file: File) =>
    expectJson(api.files.$post({ form: { file, ...(parentId ? { parentId } : {}) } }), nodeSchema),
  update: (id: string, update: UpdateNode) =>
    expectJson(api.nodes[":id"].$patch({ param: { id }, json: update }), nodeSchema),
  trash: (id: string) => expectJson(api.nodes[":id"].trash.$post({ param: { id } }), nodeSchema),
  restore: (id: string) => expectJson(api.nodes[":id"].restore.$post({ param: { id } }), nodeSchema),
  content: (id: string, version?: number) =>
    expectBytes(
      api.files[":id"].content.$get({ param: { id }, query: version ? { version: String(version) } : {} }),
    ),
  contentUrl: (id: string, version?: number) =>
    api.files[":id"].content
      .$url({ param: { id }, query: version ? { version: String(version) } : {} })
      .toString(),
  copy: (id: string) => expectJson(api.files[":id"].copy.$post({ param: { id } }), nodeSchema),
  restoreVersion: (id: string, number: number) =>
    expectJson(
      api.files[":id"].versions[":number"].restore.$post({ param: { id, number: String(number) } }),
      nodeSchema,
    ),
  share: (id: string, email: string, role: ShareRole) =>
    expectJson(api.nodes[":id"].shares.$put({ param: { id }, json: { email, role } }), shareList),
  unshare: (id: string, userId: string) =>
    expectJson(api.nodes[":id"].shares[":userId"].$delete({ param: { id, userId } }), shareList),
  createInvite: (id: string, input: CreateInvite) =>
    expectJson(api.nodes[":id"].invites.$post({ param: { id }, json: input }), inviteSchema),
  removeInvite: (id: string, token: string) =>
    expectOk(api.nodes[":id"].invites[":token"].$delete({ param: { id, token } })),
  acceptInvite: (token: string) =>
    expectJson(api.invites[":token"].accept.$post({ param: { token } }), nodeSchema),
  /** `session`: the shared session the file comes from and how much of its log it holds. */
  save: (id: string, bytes: Uint8Array, session?: SessionSave) =>
    // hc types only form and JSON bodies; `init` is spread last into fetch (hono/dist/client/client.js).
    expectJson(
      api.files[":id"].content.$put(
        { param: { id } },
        {
          init: {
            body: bytes as BodyInit,
            headers: {
              "content-type": "application/octet-stream",
              ...(session ? { [SESSION_SAVE_HEADER]: sessionSaveHeader(session) } : {}),
            },
          },
        },
      ),
      nodeSchema,
    ),
  /**
   * Saves only over the version whose content has that SHA-256: a conflict (409, CHANGED_SINCE)
   * when someone saved in between (the text editor, files-api ifMatchOf).
   */
  saveOver: (id: string, bytes: Uint8Array, sha256: string) =>
    expectJson(
      api.files[":id"].content.$put(
        { param: { id } },
        {
          init: {
            body: bytes as BodyInit,
            headers: { "content-type": "application/octet-stream", "if-match": ifMatchHeader(sha256) },
          },
        },
      ),
      nodeSchema,
    ),
  addImage: (id: string, bytes: Uint8Array) =>
    expectJson(
      api.files[":id"].media.$post(
        { param: { id } },
        { init: { body: bytes as BodyInit, headers: { "content-type": "application/octet-stream" } } },
      ),
      mediaSchema,
    ),
});

export type FileCommands = ReturnType<typeof fileCommands>;

export const refreshFiles = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: fileKeys.all });

/** A write that refreshes every file list when it has gone through. */
export const useFileMutation = <A extends unknown[]>(run: (...args: A) => Promise<FileNode>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => run(...args),
    onSettled: () => refreshFiles(queryClient),
  });
};
