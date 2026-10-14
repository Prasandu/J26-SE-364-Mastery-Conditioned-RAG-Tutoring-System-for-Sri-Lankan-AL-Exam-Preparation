import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { login as apiLogin, me, register as apiRegister } from "@/api/auth";
import type { AuthUser } from "@/api/types";
import { clearSession, readToken, saveSession } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // restoring a session from a saved token, on first load only
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>; // re-reads /auth/me, e.g. after the profile page changes the name
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Who is signed in, for the whole app.
 *
 * A token in storage does not mean it is still valid - it could be expired, or
 * signed with an old secret. This is checked once, against GET /auth/me, when the
 * app first loads; a bad token is cleared rather than left to fail on every call.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!readToken()) {
      setLoading(false);
      return;
    }
    me()
      .then(setUser)
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const token = await apiLogin(email, password);
    saveSession(token.access_token, token.role);
    setUser(await me());
  }, []);

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      await apiRegister(email, name, password);
      await login(email, password); // registering always makes a student - sign them in the same way
    },
    [login],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await me());
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and its hook belong together; splitting them across files only for
// Fast Refresh would mean every caller (and every test's
// vi.mock("@/hooks/useAuth", ...)) importing from two places instead of one, for a
// dev-only HMR nicety.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
