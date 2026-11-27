import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { me } from "@/api/auth";
import { ApiError } from "@/api/client";
import type { AuthUser } from "@/api/types";
import { useAuth as useSupabaseSession } from "@/auth/AuthContext";
import { getSupabaseClient } from "@/auth/supabase";
import { consumeSignedOut, markSignedOut } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // restoring a session on first load, or reading the account after a sign-in
  /** Set when the Supabase sign-in worked but the assessment service could not be
   * asked for the account's role - `user` is then a least-privilege student. */
  accountProblem: string;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Resolves "signed-in" or "confirm-email" (Supabase sent a confirmation link). */
  register: (email: string, name: string, password: string) => Promise<"signed-in" | "confirm-email">;
  logout: () => void;
  refreshUser: () => Promise<void>; // re-reads /auth/me, e.g. after the profile page changes the name
}

const AuthContext = createContext<AuthContextValue | null>(null);

function asApiError(cause: unknown, fallback: string): ApiError {
  if (cause instanceof ApiError) return cause;
  const message = cause instanceof Error && cause.message ? cause.message : fallback;
  const status = typeof (cause as { status?: unknown })?.status === "number" ? (cause as { status: number }).status : 0;
  return new ApiError(status, message);
}

/** Who the assessment service says this Supabase user is (role, name). If it
 * cannot be asked, a student - the least a signed-in person can be. */
async function readAccount(session: Session): Promise<{ user: AuthUser; problem: string }> {
  try {
    return { user: await me(), problem: "" };
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      throw cause;
    }
    const email = session.user.email ?? "";
    const metadata = session.user.user_metadata ?? {};
    const name = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name : email.split("@")[0];
    return {
      user: { id: 0, email, name, role: "student" },
      problem: asApiError(cause, "The assessment service is unavailable").message,
    };
  }
}

/**
 * Who is signed in, for the whole app.
 *
 * One sign-in for all four components: Supabase Auth holds the session (see
 * src/auth/AuthProvider.tsx, which planning reads directly), and this adds the
 * assessment account on top - role and display name from GET /auth/me, which links
 * the Supabase user to an account the first time it is seen (a student).
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const { session, loading: sessionLoading, signIn, signOut } = useSupabaseSession();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accountProblem, setAccountProblem] = useState("");
  const [accountFor, setAccountFor] = useState<string | null>(null);

  const sessionUserId = session?.user.id ?? null;

  useEffect(() => {
    if (!session) {
      setUser(null);
      setAccountProblem("");
      setAccountFor(null);
      return;
    }
    let active = true;
    readAccount(session)
      .then(({ user: account, problem }) => {
        if (!active) return;
        consumeSignedOut(); // a restored session is not "just signed out"
        setUser(account);
        setAccountProblem(problem);
      })
      .catch(() => {
        if (!active) return;
        setUser(null); // the token was refused outright - treat as signed out
      })
      .finally(() => {
        if (active) setAccountFor(session.user.id);
      });
    return () => {
      active = false;
    };
    // Only a different person (or signing out) needs the account re-read, not every
    // token refresh Supabase does in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  const loading = sessionLoading || (sessionUserId !== null && accountFor !== sessionUserId);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        await signIn(email, password);
      } catch (cause) {
        throw asApiError(cause, "Could not sign in");
      }
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        throw new ApiError(401, "Could not sign in");
      }
      const { user: account, problem } = await readAccount(data.session);
      consumeSignedOut(); // signing in again clears any leftover sign-out flag
      setUser(account);
      setAccountProblem(problem);
      setAccountFor(data.session.user.id);
      return account;
    },
    [signIn],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: { data: { name: name.trim(), full_name: name.trim() } },
      });
      if (error) {
        throw asApiError(error, "Could not create the account");
      }
      // With email confirmation on, Supabase sends a link and there is no session
      // yet; the account here is made on the first sign-in after confirming.
      if (!data.session) {
        return "confirm-email" as const;
      }
      await login(email, password);
      return "signed-in" as const;
    },
    [login],
  );

  const logout = useCallback(() => {
    markSignedOut();
    setUser(null);
    void signOut().catch(() => undefined);
  }, [signOut]);

  const refreshUser = useCallback(async () => {
    setUser(await me());
  }, []);

  const value = useMemo(
    () => ({ user, loading, accountProblem, login, register, logout, refreshUser }),
    [user, loading, accountProblem, login, register, logout, refreshUser],
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
