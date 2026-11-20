import React, { createContext, useContext, useEffect, useState } from "react";
import {
  api,
  restoreToken,
  saveToken,
  clearToken,
  onExpired,
  revokeToken,
} from "./api";
import { disableReminder } from "./notifications";
import type { User } from "./domain";
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  signIn: (
    input: {
      email: string;
      password: string;
      name?: string;
      adult?: boolean;
      terms?: boolean;
    },
    register: boolean,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  clearLocal: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function reload() {
    const data = await api<{ user: User; emailVerificationRequired: boolean }>(
      "account",
    );
    setUser({
      ...data.user,
      verification_required: data.emailVerificationRequired,
    });
  }
  async function clearLocal() {
    try {
      await disableReminder();
    } catch {}
    try {
      await clearToken();
    } finally {
      setUser(null);
    }
  }
  useEffect(() => {
    onExpired(() => {
      setUser(null);
      void disableReminder().catch(() => {});
    });
    void (async () => {
      try {
        if (await restoreToken()) await reload();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => onExpired(() => {});
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        reload,
        clearLocal,
        async signIn(input, register) {
          const data = await api<{ token: string; user: User }>(
            `auth/native/${register ? "register" : "login"}`,
            "POST",
            input,
          );
          try {
            await saveToken(data.token);
          } catch {
            await revokeToken(data.token).catch(() => {});
            throw Error(
              "Secure storage is unavailable. Sign-in was not saved.",
            );
          }
          setError("");
          setUser(data.user);
        },
        async signOut() {
          let failure: unknown;
          try {
            await api("auth/logout", "POST", {});
          } catch (e) {
            failure = e;
          } finally {
            await clearLocal();
          }
          if (failure)
            throw Error(
              "Signed out on this device. The server could not revoke the session; it expires within seven days.",
            );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw Error("Missing auth provider");
  return value;
}
