import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionResource } from '@vlab/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { activeSessionKey, AuthGate } from '../auth/AuthGate';
import {
  createLabAuthFromEnv,
  createSupabaseLabAuth,
  disabledLabAuth,
  type AuthState,
  type LabAuth,
  type SupabaseAuthLike,
} from '../auth/labAuth';
import { EngineError, type EngineAdapter } from '../engine/adapter';
import { createApiEngineAdapter } from '../engine/apiAdapter';
import { StoreProvider } from '../store/StoreProvider';
import { makeLocalAdapter, makeStore } from './helpers';

/**
 * LAB-018 browser side: the lab signs in with the platform's Supabase project, sends the
 * token on every API call, renews it once on a 401, says so when the sign-in expires, and
 * reopens the student's own practical after a refresh. No real Supabase or network.
 */

const FIXTURES = join(__dirname, '../../../../packages/contracts/fixtures');
const resource = JSON.parse(
  readFileSync(join(FIXTURES, 'api/session-resource.json'), 'utf8'),
) as SessionResource;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthenticated = () =>
  json(401, {
    error: {
      code: 'unauthenticated',
      retryable: false,
      message: 'Sign in again',
      correlationId: null,
    },
  });

const STUDENT_A = '00000000-0000-4000-8000-00000000000a';
const STUDENT_B = '00000000-0000-4000-8000-00000000000b';

/** A controllable LabAuth for UI tests. */
const fakeAuth = (initial: AuthState) => {
  let state = initial;
  const listeners = new Set<(s: AuthState) => void>();
  const auth: LabAuth & { set(next: AuthState): void } = {
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getAccessToken: vi.fn(async () => 'token'),
    refresh: vi.fn(async () => null),
    markExpired: vi.fn(),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    set: (next) => {
      state = next;
      listeners.forEach((l) => l(next));
    },
  };
  return auth;
};

afterEach(() => window.localStorage.clear());

describe('Supabase lab auth', () => {
  const session = (token: string, id = STUDENT_A) => ({ access_token: token, user: { id } });
  const supabase = (overrides: Partial<SupabaseAuthLike> = {}): SupabaseAuthLike => ({
    getSession: vi.fn(async () => ({ data: { session: session('t1') }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: session('t2') }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
    signInWithPassword: vi.fn(async () => ({ data: { session: session('t3') }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  });

  it('starts loading, then reports the signed-in student from the stored session', async () => {
    const auth = createSupabaseLabAuth(supabase());

    expect(auth.getState()).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(auth.getState()).toEqual({ status: 'signed_in', userId: STUDENT_A }),
    );
    expect(await auth.getAccessToken()).toBe('t1');
    expect(await auth.refresh()).toBe('t2');
  });

  it('cannot renew a revoked session and reports sign-in and sign-out changes', async () => {
    const changes: ((event: string, s: ReturnType<typeof session> | null) => void)[] = [];
    const auth = createSupabaseLabAuth(
      supabase({
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        refreshSession: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'revoked' },
        })),
        onAuthStateChange: vi.fn((callback) => {
          changes.push(callback);
          return { data: { subscription: { unsubscribe: () => undefined } } };
        }),
      }),
    );
    await waitFor(() => expect(auth.getState()).toEqual({ status: 'signed_out' }));

    expect(await auth.refresh()).toBeNull();
    act(() => changes[0]?.('SIGNED_IN', session('t9', STUDENT_B)));
    expect(auth.getState()).toEqual({ status: 'signed_in', userId: STUDENT_B });
    auth.markExpired();
    expect(auth.getState()).toEqual({ status: 'expired' });
    await auth.signOut();
    expect(auth.getState()).toEqual({ status: 'signed_out' });
  });

  it('refuses a wrong password without changing state', async () => {
    const auth = createSupabaseLabAuth(
      supabase({
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'Invalid login' },
        })),
      }),
    );
    await waitFor(() => expect(auth.getState().status).toBe('signed_out'));

    await expect(auth.signIn('s@school.lk', 'wrong')).rejects.toThrow('Invalid login');
    expect(auth.getState()).toEqual({ status: 'signed_out' });
  });

  it('never falls back to unsigned requests in a production API build', () => {
    expect(() => createLabAuthFromEnv({ PROD: true, VITE_ENGINE_ADAPTER: 'api' })).toThrow(
      /VITE_SUPABASE_URL/,
    );
    expect(createLabAuthFromEnv({ PROD: false, VITE_ENGINE_ADAPTER: 'api' })).toBe(disabledLabAuth);
    expect(createLabAuthFromEnv({ PROD: true, VITE_ENGINE_ADAPTER: 'local' })).toBe(
      disabledLabAuth,
    );
  });
});

describe('API adapter with sign-in', () => {
  const authWith = (tokens: (string | null)[]) => {
    const refresh = vi.fn(async () => tokens.shift() ?? null);
    return {
      getAccessToken: vi.fn(async () => 'old-token'),
      refresh,
      markExpired: vi.fn(),
    };
  };

  it('sends the student token on every request, never a student id', async () => {
    const fetchMock = vi.fn(async () => json(200, resource));
    const auth = authWith([]);
    const adapter = createApiEngineAdapter({ baseUrl: 'http://lab.test', fetch: fetchMock, auth });

    await adapter.getSession?.(resource.session.sessionId);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://lab.test/sessions/${resource.session.sessionId}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-token');
    expect(JSON.stringify(init)).not.toContain(STUDENT_A);
  });

  it('renews an expired token once and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(json(200, resource));
    const auth = authWith(['new-token']);
    const adapter = createApiEngineAdapter({ baseUrl: 'http://lab.test', fetch: fetchMock, auth });

    const restored = await adapter.getSession?.(resource.session.sessionId);

    expect(restored?.session.sessionId).toBe(resource.session.sessionId);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    const retry = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((retry[1].headers as Record<string, string>).Authorization).toBe('Bearer new-token');
    expect(auth.markExpired).not.toHaveBeenCalled();
  });

  it.each([
    ['the session cannot be renewed', [null]],
    ['the renewed token is refused too', ['new-token']],
  ])('reports an expired sign-in when %s', async (_case, tokens) => {
    const fetchMock = vi.fn(async () => unauthenticated());
    const auth = authWith(tokens as (string | null)[]);
    const adapter = createApiEngineAdapter({ baseUrl: 'http://lab.test', fetch: fetchMock, auth });

    await expect(adapter.getReport('s1')).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    });
    expect(auth.markExpired).toHaveBeenCalledTimes(1);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('AuthGate', () => {
  const restoringAdapter = (outcome: 'ok' | 'missing'): EngineAdapter => ({
    ...makeLocalAdapter(),
    getSession: vi.fn(async () => {
      if (outcome === 'missing') throw new EngineError('not_found', 404, false);
      return resource;
    }),
  });

  it('shows the lab directly when sign-in is not configured', () => {
    render(
      <AuthGate auth={disabledLabAuth}>
        <p>lab content</p>
      </AuthGate>,
    );
    expect(screen.getByText('lab content')).toBeInTheDocument();
  });

  it('asks a signed-out student to sign in and sends the credentials to Supabase only', async () => {
    const auth = fakeAuth({ status: 'signed_out' });
    const user = userEvent.setup();
    render(<App store={makeStore()} auth={auth} />);

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 's@school.lk');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(auth.signIn).toHaveBeenCalledWith('s@school.lk', 'secret');
  });

  it('says the sign-in expired and that the work is saved', () => {
    render(<App store={makeStore()} auth={fakeAuth({ status: 'expired' })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('your work is saved');
  });

  it("reopens the student's own practical after a refresh", async () => {
    window.localStorage.setItem(activeSessionKey(STUDENT_A), resource.session.sessionId);
    const adapter = restoringAdapter('ok');
    const store = makeStore(42, adapter);

    render(<App store={store} auth={fakeAuth({ status: 'signed_in', userId: STUDENT_A })} />);

    await waitFor(() =>
      expect(store.getState().session?.sessionId).toBe(resource.session.sessionId),
    );
    expect(adapter.getSession).toHaveBeenCalledWith(resource.session.sessionId);
    expect(store.getState().view).toBe('workbench');
  });

  it("never offers one student another student's remembered practical", async () => {
    window.localStorage.setItem(activeSessionKey(STUDENT_A), resource.session.sessionId);
    const adapter = restoringAdapter('ok');

    render(
      <App
        store={makeStore(42, adapter)}
        auth={fakeAuth({ status: 'signed_in', userId: STUDENT_B })}
      />,
    );

    await act(async () => undefined);
    expect(adapter.getSession).not.toHaveBeenCalled();
  });

  it("forgets a practical the server no longer has (or that is not this student's)", async () => {
    window.localStorage.setItem(activeSessionKey(STUDENT_A), 'gone-session');
    const adapter = restoringAdapter('missing');

    render(
      <App
        store={makeStore(42, adapter)}
        auth={fakeAuth({ status: 'signed_in', userId: STUDENT_A })}
      />,
    );

    await waitFor(() =>
      expect(window.localStorage.getItem(activeSessionKey(STUDENT_A))).toBeNull(),
    );
  });

  it('clears the lab when a different student signs in on the same tab', () => {
    const auth = fakeAuth({ status: 'signed_in', userId: STUDENT_A });
    const onIdentityChange = vi.fn();
    render(
      <StoreProvider store={makeStore()}>
        <AuthGate auth={auth} onIdentityChange={onIdentityChange}>
          <p>lab content</p>
        </AuthGate>
      </StoreProvider>,
    );

    act(() => auth.set({ status: 'expired' }));
    expect(onIdentityChange).not.toHaveBeenCalled(); // expiry keeps the work
    act(() => auth.set({ status: 'signed_in', userId: STUDENT_B }));
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });
});
