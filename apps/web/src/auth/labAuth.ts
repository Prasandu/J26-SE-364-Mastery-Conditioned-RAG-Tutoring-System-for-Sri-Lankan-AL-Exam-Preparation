import { createClient } from '@supabase/supabase-js';

/**
 * LAB-018 browser side: who the student is, for the lab API.
 *
 * The lab signs in with the platform's Supabase project (the same identity the other three
 * components use). The access token goes to the lab API as `Authorization: Bearer`; the API
 * verifies it (supabase_jwt principal) and takes the owner from the token - the browser never
 * names the student. Served from the same origin as the main platform, the stored Supabase
 * session is shared; on another origin the student signs in once here.
 *
 * No insecure fallback: a production build that talks to the API refuses to start without
 * the Supabase configuration (the local engine and development API keep working unsigned).
 */

export type AuthState =
  | { status: 'disabled' } // no sign-in configured: local engine / development API only
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'expired' } // the token was refused and could not be refreshed
  | { status: 'signed_in'; userId: string };

export interface LabAuth {
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  /** The current access token, or null when unsigned. Supabase refreshes it before expiry. */
  getAccessToken(): Promise<string | null>;
  /** After a 401: force one refresh; null when the session cannot be renewed. */
  refresh(): Promise<string | null>;
  /** The API still refused the token after a refresh. */
  markExpired(): void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

interface SupabaseSession {
  access_token: string;
  user: { id: string };
}

/** The part of the Supabase client the lab uses (so tests can supply a fake). */
export interface SupabaseAuthLike {
  getSession(): Promise<{ data: { session: SupabaseSession | null }; error: unknown }>;
  refreshSession(): Promise<{ data: { session: SupabaseSession | null }; error: unknown }>;
  onAuthStateChange(callback: (event: string, session: SupabaseSession | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: { session: SupabaseSession | null }; error: { message: string } | null }>;
  signOut(): Promise<{ error: unknown }>;
}

export class SignInError extends Error {}

export const createSupabaseLabAuth = (auth: SupabaseAuthLike): LabAuth => {
  let state: AuthState = { status: 'loading' };
  const listeners = new Set<(s: AuthState) => void>();
  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(next));
  };
  const fromSession = (session: SupabaseSession | null): AuthState =>
    session ? { status: 'signed_in', userId: session.user.id } : { status: 'signed_out' };

  void auth.getSession().then(({ data }) => {
    if (state.status === 'loading') set(fromSession(data.session));
  });
  auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' && state.status !== 'loading') return;
    set(fromSession(session));
  });

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAccessToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
    refresh: async () => {
      const { data, error } = await auth.refreshSession();
      if (error || !data.session) return null;
      return data.session.access_token;
    },
    markExpired: () => set({ status: 'expired' }),
    signIn: async (email, password) => {
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new SignInError(error?.message ?? 'sign_in_failed');
      set(fromSession(data.session));
    },
    signOut: async () => {
      await auth.signOut();
      set({ status: 'signed_out' });
    },
  };
};

const DISABLED: AuthState = { status: 'disabled' }; // one object: React compares snapshots by identity

/** Sign-in switched off (local engine or development API): every request is unsigned. */
export const disabledLabAuth: LabAuth = {
  getState: () => DISABLED,
  subscribe: () => () => undefined,
  getAccessToken: async () => null,
  refresh: async () => null,
  markExpired: () => undefined,
  signIn: async () => {
    throw new SignInError('sign_in_not_configured');
  },
  signOut: async () => undefined,
};

export interface LabAuthEnv {
  readonly PROD?: boolean;
  readonly VITE_ENGINE_ADAPTER?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

export const labAuthRequired = (env: LabAuthEnv): boolean =>
  Boolean(env.PROD) && env.VITE_ENGINE_ADAPTER === 'api';

export const createLabAuthFromEnv = (env: LabAuthEnv): LabAuth => {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    if (labAuthRequired(env)) {
      throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for the lab API');
    }
    return disabledLabAuth;
  }
  const client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return createSupabaseLabAuth(client.auth as unknown as SupabaseAuthLike);
};
