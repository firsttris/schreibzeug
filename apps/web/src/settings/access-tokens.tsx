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
import { Button } from "../ui/button";

type Days = (typeof TOKEN_DAYS)[number] | null;

const SCOPE_TEXT: Record<TokenScope, string> = { read: "Nur lesen", write: "Lesen und schreiben" };
const DAYS_TEXT = (days: Days) => (days === null ? "Unbegrenzt" : `${days} Tage`);
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
    <CopyButton text={value} label={`${label} kopieren`} />
  </div>
);

/** The token just made: shown this once, with the command to connect Claude Code. */
const NewToken = ({ created, onClose }: { created: CreatedAccessToken; onClose: () => void }) => {
  const { mcpUrl } = useFiles();
  return (
    <div
      role="status"
      aria-label="Neuer Zugangsschlüssel"
      className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3"
    >
      <p className="m-0 text-sm">
        Der Schlüssel „{created.name}“ ist angelegt. Kopiere ihn jetzt: Er wird nur dieses eine Mal angezeigt.
      </p>
      <CopyLine label="Zugangsschlüssel" value={created.token} />
      <p className="m-0 text-sm text-[var(--muted-foreground)]">Claude Code verbinden:</p>
      <CopyLine label="Befehl für Claude Code" value={claudeCommand(mcpUrl, created.token)} />
      <Button variant="ghost" className="self-end" onClick={onClose}>
        Fertig
      </Button>
    </div>
  );
};

const CreateForm = ({ onCreated }: { onCreated: (created: CreatedAccessToken) => void }) => {
  const { tokens } = useFiles();
  const queryClient = useQueryClient();
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
          aria-label="Name des Schlüssels"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${inputClass} flex-1`}
        />
        <select
          aria-label="Umfang"
          value={scope}
          onChange={(event) => setScope(event.target.value as TokenScope)}
          className={selectClass}
        >
          {(Object.keys(SCOPE_TEXT) as TokenScope[]).map((value) => (
            <option key={value} value={value}>
              {SCOPE_TEXT[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Gültig"
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
          Schlüssel anlegen
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
    SCOPE_TEXT[token.scope],
    `angelegt ${formatDay(token.createdAt)}`,
    token.lastUsedAt ? `zuletzt benutzt ${formatDay(token.lastUsedAt)}` : "noch nie benutzt",
    token.expiresAt ? `gilt bis ${formatDay(token.expiresAt)}` : "unbegrenzt",
  ].join(" · ");

const TokenList = ({ list }: { list: AccessToken[] }) => {
  const { tokens } = useFiles();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) => tokens.revoke(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokenKeys.all }),
  });
  if (list.length === 0) {
    return <p className="m-0 text-sm text-[var(--muted-foreground)]">Noch keine Zugangsschlüssel.</p>;
  }
  return (
    <ul aria-label="Deine Zugangsschlüssel" className="m-0 flex list-none flex-col gap-1 p-0">
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
            aria-label={`${token.name} widerrufen`}
            title="Widerrufen"
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
    <section aria-label="Zugangsschlüssel" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-semibold">Zugangsschlüssel</h2>
        <p className="m-0 text-sm text-[var(--muted-foreground)]">
          Damit arbeiten Claude Code und andere MCP-Programme in Schreibzeug, mit deinen Rechten. Jede
          Änderung wird eine neue Version; „Nur lesen“ erlaubt keine Änderungen.
        </p>
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
