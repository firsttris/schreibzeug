import { createContext, type ReactNode, useContext } from "react";
import type { Account, User } from "../api/account";

const AccountContext = createContext<Account | null>(null);
const UserContext = createContext<User | null>(null);

/** Hands the account client down, like FilesProvider the files client. */
export const AccountProvider = ({ account, children }: { account: Account; children: ReactNode }) => (
  <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
);

export const useAccount = (): Account => {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount needs an AccountProvider");
  return account;
};

/** The signed-in person; the pages behind the sign-in check provide them (router.tsx). */
export const UserProvider = ({ user, children }: { user: User; children: ReactNode }) => (
  <UserContext.Provider value={user}>{children}</UserContext.Provider>
);

export const useUser = (): User => {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser is for pages behind the sign-in");
  return user;
};
