import { Link } from "@tanstack/react-router";
import { m } from "../paraglide/messages";

/** While an editor page loads its file. */
export const Loading = () => (
  <p role="status" className="m-0 p-8 text-sm text-[var(--muted-foreground)]">
    {m.page_states_loading()}
  </p>
);

/** Why the file could not be opened, with the way back. */
export const Failure = ({ message }: { message: string }) => (
  <div role="alert" className="flex flex-col items-start gap-3 p-8 text-sm">
    <p className="m-0">{message}</p>
    <Link to="/">{m.page_states_back_to_files()}</Link>
  </div>
);
