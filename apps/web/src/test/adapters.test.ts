import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionResult, Report, SessionResource } from '@vlab/contracts';
import { describe, expect, it, vi } from 'vitest';
import { EngineError, type SubmitRequest } from '../engine/adapter';
import { createApiEngineAdapter } from '../engine/apiAdapter';
import { selectEngineAdapter } from '../engine/select';
import { makeLocalAdapter } from './helpers';

/**
 * Adapter contract parity. The shared fixtures were recorded from the engine; the Python API is
 * checked against the same files (apps/api/tests/test_parity_and_contracts.py). Here the offline
 * adapter must reproduce them, and the API adapter must round-trip them unchanged.
 */
interface ParityFixture {
  init: { mode: 'guided' | 'manual'; guidanceLevel: 'beginner' | null; seed: number };
  steps: { envelope: SubmitRequest['envelope']; expected: ActionResult }[];
  finalReport: Report;
}
const FIXTURES = join(__dirname, '../../../../packages/contracts/fixtures');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T;
const strip = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(strip)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => k !== 'sessionId' && k !== 'elapsedMs')
            .map(([k, x]) => [k, strip(x)]),
        )
      : v;

describe.each(['perfect-guided-beginner', 'manual-hidden-errors', 'manual-zero-solute'])(
  'local adapter parity: %s',
  (name) => {
    it('reproduces the public results and the final report recorded from the engine', async () => {
      const fixture = load<ParityFixture>(`parity/${name}.json`);
      const adapter = makeLocalAdapter(fixture.init.seed);
      const { session } = await adapter.createSession({
        mode: fixture.init.mode,
        guidanceLevel: fixture.init.guidanceLevel,
        locale: 'en',
        preLab: null,
      });
      for (const [i, step] of fixture.steps.entries()) {
        const result = await adapter.submitAction(session.sessionId, {
          clientActionId: crypto.randomUUID(),
          expectedSequence: i,
          envelope: step.envelope,
        });
        expect(strip(result), `step ${i}`).toEqual(strip(step.expected));
      }
      expect(strip(await adapter.getReport(session.sessionId))).toEqual(strip(fixture.finalReport));
    });
  },
);

describe('local adapter enforces the server rules', () => {
  it('stale sequence, idempotent retry and key reuse', async () => {
    const adapter = makeLocalAdapter();
    const { session } = await adapter.createSession({
      mode: 'manual',
      guidanceLevel: null,
      locale: 'en',
      preLab: null,
    });
    const req: SubmitRequest = {
      clientActionId: crypto.randomUUID(),
      expectedSequence: 0,
      envelope: {
        action: { type: 'request_hint' },
        actor: 'student',
        acknowledgedSafetyWarning: false,
      },
    };
    const first = await adapter.submitAction(session.sessionId, req);
    expect(await adapter.submitAction(session.sessionId, req)).toEqual(first);
    await expect(
      adapter.submitAction(session.sessionId, {
        ...req,
        envelope: { ...req.envelope, action: { type: 'remove_funnel' } },
      }),
    ).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(
      adapter.submitAction(session.sessionId, { ...req, clientActionId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'stale_sequence', details: { currentSequence: 1 } });
    await expect(adapter.getReport(session.sessionId)).rejects.toMatchObject({
      code: 'report_not_available',
    });
  });
});

describe('API adapter', () => {
  const resource = load<SessionResource>('api/session-resource.json');
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('creates the server session with canonical versions and no hard-coded URL', async () => {
    const fetchMock = vi.fn(async () => json(201, resource));
    const adapter = createApiEngineAdapter({
      baseUrl: 'http://api.example.test/',
      fetch: fetchMock,
    });
    const created = await adapter.createSession({
      mode: 'guided',
      guidanceLevel: 'beginner',
      locale: 'si',
      preLab: null,
    });
    expect(created.session.mode).toBe('guided');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.example.test/sessions');
    expect(JSON.parse(String(init.body))).toEqual({
      experimentId: 'exp04_standard_solution',
      experimentVersion: '1.1.0',
      assessmentVersion: '1.0.0',
      mode: 'guided',
      guidanceLevel: 'beginner',
      locale: 'si',
      preLab: null,
    });
  });

  it('sends clientActionId and expectedSequence and returns the parsed server result', async () => {
    const fixture = load<ParityFixture>('parity/perfect-guided-beginner.json');
    const step = fixture.steps[0]!;
    const fetchMock = vi.fn(async () => json(200, step.expected));
    const adapter = createApiEngineAdapter({
      baseUrl: 'http://api.example.test',
      fetch: fetchMock,
    });
    const req: SubmitRequest = {
      clientActionId: '7b0f2c1e-8d4a-4f6e-9a3b-2c5d6e7f8a9b',
      expectedSequence: 0,
      envelope: step.envelope,
    };
    const result = await adapter.submitAction('abc', req);
    expect(result).toEqual(step.expected);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.example.test/sessions/abc/actions');
    expect(JSON.parse(String(init.body))).toEqual({ ...req, preview: false });
  });

  it('maps API errors, network failures and invalid responses to engine errors', async () => {
    const error = load('api/error.json');
    const conflict = createApiEngineAdapter({
      baseUrl: 'http://x',
      fetch: async () => json(409, error),
    });
    await expect(conflict.getReport('s')).rejects.toMatchObject({
      code: 'stale_sequence',
      status: 409,
      details: { currentSequence: 3 },
    });
    const offline = createApiEngineAdapter({
      baseUrl: 'http://x',
      fetch: async () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await expect(offline.getReport('s')).rejects.toMatchObject({
      code: 'network_unavailable',
      retryable: true,
    });
    const garbage = createApiEngineAdapter({
      baseUrl: 'http://x',
      fetch: async () => json(200, { unexpected: true }),
    });
    await expect(garbage.getReport('s')).rejects.toBeInstanceOf(EngineError);
    await expect(garbage.getReport('s')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('adapter selection', () => {
  it('defaults to the offline adapter and requires a base URL for the API adapter', () => {
    expect(selectEngineAdapter({} as ImportMetaEnv).kind).toBe('local');
    expect(
      selectEngineAdapter({
        VITE_ENGINE_ADAPTER: 'api',
        VITE_API_BASE_URL: 'http://localhost:8000',
      } as ImportMetaEnv).kind,
    ).toBe('api');
    expect(() => selectEngineAdapter({ VITE_ENGINE_ADAPTER: 'api' } as ImportMetaEnv)).toThrow(
      /VITE_API_BASE_URL/,
    );
  });
});
