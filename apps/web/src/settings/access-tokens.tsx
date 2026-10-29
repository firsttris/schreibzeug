import {
  type AccessToken,
  type CreatedAccessToken,
  TOKEN_DAYS,
  type TokenScope,
} from "@schreibzeug/files-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { claudeCommand, tokenKeys } from "../api/tokens";
import { selectClass } from "../files/role-select";
import { formatDay } from "../lib/format";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";

type Days = (typeof TOKEN_DAYS)[number] | null;

const SCOPE_TEXT: Record<TokenScope, () => string> = {
  read: m.access_tokens_read,
  write: m.access_tokens_write,
};
const DAYS_TEXT = (days: Days) =>
  days === null ? m.access_tokens_unlimited() : m.access_tokens_days({ count: String(days) });
const inputClass =
  "h-9 min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--foreground)]";

/** Copies a text, and says so for a moment. */
const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </Button>
  );
};

/** A line to copy: the token, or the command that connects Claude Code. */
const CopyLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <input
      readOnly
      aria-label={label}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 font-mono text-xs outline-none"
    />
    <CopyButton text={value} label={m.access_tokens_copy({ label })} />
  </div>
);

/** The token just made: shown this once, with the command to connect Claude Code. */
const NewToken = ({ created, onClose }: { created: CreatedAccessToken; onClose: () => void }) => {
  const { mcpUrl } = useFiles();
  return (
    <div
      role="status"
      aria-label={m.access_tokens_new()}
      className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3"
    >
      <p className="m-0 text-sm">{m.access_tokens_created({ name: created.name })}</p>
      <CopyLine label={m.access_tokens_token()} value={created.token} />
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.access_tokens_connect()}</p>
      <CopyLine label={m.access_tokens_command()} value={claudeCommand(mcpUrl, created.token)} />
      <Button variant="ghost" className="self-end" onClick={onClose}>
        {m.common_done()}
      </Button>
    </div>
  );
};

const CreateForm = ({ onCreated }: { onCreated: (created: CreatedAccessToken) => void }) => {
  const { tokens } = useFiles();
  const queryClient = useQueryClient();
  // i18n-ignore: the program the token is for, a name
  const [name, setName] = useState("Claude Code");
  const [scope, setScope] = useState<TokenScope>("write");
  const [days, setDays] = useState<Days>(90);
  const create = useMutation({
    mutationFn: () => tokens.create({ name, scope, days }),
    onSuccess: (created) => {
      onCreated(created);
      void queryClient.invalidateQueries({ queryKey: tokenKeys.all });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={m.access_tokens_name()}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${inputClass} flex-1`}
        />
        <select
          aria-label={m.access_tokens_scope()}
          value={scope}
          onChange={(event) => setScope(event.target.value as TokenScope)}
          className={selectClass}
        >
          {(Object.keys(SCOPE_TEXT) as TokenScope[]).map((value) => (
            <option key={value} value={value}>
              {SCOPE_TEXT[value]()}
            </option>
          ))}
        </select>
        <select
          aria-label={m.access_tokens_valid()}
          value={days ?? "never"}
          onChange={(event) =>
            setDays(event.target.value === "never" ? null : (Number(event.target.value) as Days))
          }
          className={selectClass}
        >
          {[...TOKEN_DAYS, null].map((value) => (
            <option key={value ?? "never"} value={value ?? "never"}>
              {DAYS_TEXT(value)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          <KeyRound size={15} />
          {m.access_tokens_create()}
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(create.error)}
        </p>
      )}
    </form>
  );
};

const summaryOf = (token: AccessToken): string =>
  [
    SCOPE_TEXT[token.scope](),
    m.access_tokens_created_on({ date: formatDay(token.createdAt) }),
    token.lastUsedAt
      ? m.access_tokens_last_used({ date: formatDay(token.lastUsedAt) })
      : m.access_tokens_never_used(),
    token.expiresAt
      ? m.access_tokens_valid_until({ date: formatDay(token.expiresAt) })
      : m.access_tokens_no_expiry(),
  ].join(" · ");

const TokenList = ({ list }: { list: AccessToken[] }) => {
  const { tokens } = useFiles();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) => tokens.revoke(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokenKeys.all }),
  });
  if (list.length === 0) {
    return <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.access_tokens_none()}</p>;
  }
  return (
    <ul aria-label={m.access_tokens_yours()} className="m-0 flex list-none flex-col gap-1 p-0">
      {list.map((token) => (
        <li
          key={token.id}
          data-token={token.name}
          className="flex items-center gap-2 border-b border-[var(--border)] py-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{token.name}</span>
            <span className="text-xs text-[var(--muted-foreground)]">{summaryOf(token)}</span>
          </span>
          <Button
            variant="ghost"
            aria-label={m.access_tokens_revoke_name({ name: token.name })}
            title={m.access_tokens_revoke()}
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(token.id)}
          >
            <X size={15} />
          </Button>
        </li>
      ))}
      {revoke.isError && (
        <li role="alert" className="text-sm text-red-600 dark:text-red-400">
          {messageOf(revoke.error)}
        </li>
      )}
    </ul>
  );
};

/**
 * Personal access tokens: with one, Claude Code and other MCP clients work in Schreibzeug as the
 * person, with their rights (docs/mcp.md). The server keeps only a hash, so a token is shown once.
 */
export const AccessTokens = () => {
  const { tokens } = useFiles();
  const list = useQuery(tokens.list());
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);
  return (
    <section aria-label={m.access_tokens_title()} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-semibold">{m.access_tokens_title()}</h2>
        <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.access_tokens_hint()}</p>
      </div>
      {created ? (
        <NewToken created={created} onClose={() => setCreated(null)} />
      ) : (
        <CreateForm onCreated={setCreated} />
      )}
      {list.isError && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(list.error)}
        </p>
      )}
      {list.data && <TokenList list={list.data} />}
    </section>
  );
};
