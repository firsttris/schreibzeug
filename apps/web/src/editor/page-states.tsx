import { Link } from "@tanstack/react-router";

/** While an editor page loads its file. */
export const Loading = () => (
  <p role="status" className="m-0 p-8 text-sm text-[var(--muted-foreground)]">
    Lädt …
  </p>
);

/** Why the file could not be opened, with the way back. */
export const Failure = ({ message }: { message: string }) => (
  <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
    <p className="m-0">{message}</p>
    <Link to="/">Zu meinen Dateien</Link>
  </div>
);
