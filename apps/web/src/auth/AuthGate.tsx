import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import type { AuthState, LabAuth } from './labAuth';

const subscribeTo = (auth: LabAuth) => (listener: () => void) => auth.subscribe(() => listener());

/** The remembered session is per student: one student's id is never offered to another. */
export const activeSessionKey = (userId: string) => `vlab.activeSession.${userId}`;

const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeKey = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: restoring after a refresh is a convenience only.
  }
};

/**
 * LAB-018: the lab opens only for a signed-in student when sign-in is configured. Loading,
 * signed-out and expired states each have their own screen; an expired sign-in keeps the
 * student's work (it is stored on the server) and resumes it after signing in again.
 */
/** Clears every in-memory trace of the previous student (store, notebook drafts, report). */
export const reloadLab = () => window.location.assign(window.location.pathname);

export function AuthGate({
  auth,
  children,
  onIdentityChange = reloadLab,
}: {
  auth: LabAuth;
  children: ReactNode;
  onIdentityChange?: () => void;
}) {
  const subscribe = useMemo(() => subscribeTo(auth), [auth]);
  const state = useSyncExternalStore(subscribe, auth.getState, auth.getState);
  const { t } = useTranslation();
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    // Another student signed in on this tab (or this one signed out): never keep the last
    // student's lab state in memory.
    const current = state.status === 'signed_in' ? state.userId : null;
    if (lastUser.current && current !== lastUser.current && state.status !== 'expired') {
      onIdentityChange();
    }
    if (current) lastUser.current = current;
  }, [state, onIdentityChange]);

  if (state.status === 'disabled') return <>{children}</>;
  if (state.status === 'loading') {
    return (
      <p className="hint-text auth-status" role="status">
        {t('auth.checking')}
      </p>
    );
  }
  if (state.status === 'signed_out' || state.status === 'expired') {
    return <SignInPanel auth={auth} expired={state.status === 'expired'} />;
  }
  return (
    <>
      <div className="auth-bar">
        <button className="auth-bar__signout" onClick={() => void auth.signOut()} type="button">
          {t('auth.signOut')}
        </button>
      </div>
      <SessionRestorer userId={state.userId} />
      {children}
    </>
  );
}

function SignInPanel({ auth, expired }: { auth: LabAuth; expired: boolean }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await auth.signIn(email.trim(), password);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="app-main auth-panel">
      <h1>{t('auth.title')}</h1>
      {expired ? (
        <p className="auth-panel__notice" role="alert">
          {t('auth.expired')}
        </p>
      ) : (
        <p>{t('auth.intro')}</p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {t('auth.email')}
          <input
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error ? (
          <p className="auth-panel__error" role="alert">
            {t('auth.failed')}
          </p>
        ) : null}
        <button disabled={busy} type="submit">
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </main>
  );
}

/** Remembers the student's open practical and reopens it after a refresh or server restart. */
function SessionRestorer({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const sessionId = useSession((s) => s.session?.sessionId ?? null);
  const restoreSession = useSession((s) => s.restoreSession);
  const [restoring, setRestoring] = useState<string | null>(() =>
    sessionId ? null : readKey(activeSessionKey(userId)),
  );

  useEffect(() => {
    if (!restoring) return;
    let active = true;
    void restoreSession(restoring).then((outcome) => {
      if (!active) return;
      if (outcome === 'not_found') writeKey(activeSessionKey(userId), null);
      setRestoring(null);
    });
    return () => {
      active = false;
    };
  }, [restoring, restoreSession, userId]);

  useEffect(() => {
    if (sessionId) writeKey(activeSessionKey(userId), sessionId);
  }, [sessionId, userId]);

  return restoring ? (
    <p className="hint-text auth-status" role="status">
      {t('auth.restoring')}
    </p>
  ) : null;
}

export type { AuthState };
