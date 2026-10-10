import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VerifierResponseSchema,
  type DomainEvent,
  type SessionInit,
  type VerifierResponse,
} from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import assessmentJson from '../../../content/experiments/exp04/assessment.v1.json';
import definitionJson from '../../../content/experiments/exp04/definition.v1.json';
import pkg from '../package.json';
import { canonicalUntil, go, start } from './helpers';

/** Exercises the bundled CLI (dist/verifier.mjs), exactly as the Python API runs it. */
const CLI = fileURLToPath(new URL('../dist/verifier.mjs', import.meta.url));
const init: SessionInit = {
  sessionId: 'test-session',
  mode: 'manual',
  guidanceLevel: null,
  seed: 42,
  startedOn: '2026-10-10',
};
const expected = {
  engineVersion: pkg.version,
  definitionVersion: '1.1.0',
  assessmentVersion: '1.0.0',
};

const call = (request: unknown): VerifierResponse => {
  const out = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    shell: false,
  });
  expect(out.status).toBe(0);
  return VerifierResponseSchema.parse(JSON.parse(out.stdout));
};
const req = (op: string, extra: Record<string, unknown> = {}) => ({
  protocol: 1,
  op,
  expected,
  definition: definitionJson,
  assessment: assessmentJson,
  init,
  ...extra,
});
const finished = canonicalUntil(start(), 'end');
const events: DomainEvent[] = finished.events;

describe('verifier CLI (built output)', () => {
  it('is built', () => expect(existsSync(CLI)).toBe(true));

  it('initializes a session view', () => {
    const r = call(req('initialize'));
    expect(r).toMatchObject({ ok: true, op: 'initialize', engineVersion: pkg.version });
    if (r.ok && r.op === 'initialize') expect(r.result.view.nextSequence).toBe(0);
  });

  it('applies an action after verifying the stored chain', () => {
    const partial = events.slice(0, 5);
    const envelope = {
      action: { type: 'request_hint' },
      actor: 'student',
      elapsedMs: 999_999,
      acknowledgedSafetyWarning: false,
    };
    const r = call(req('apply', { events: partial, envelope }));
    expect(r.ok && r.op === 'apply' && r.result.event.seq).toBe(5);
  });

  it('replays to the same head fingerprint as the in-process engine', () => {
    const r = call(req('verify', { events }));
    expect(r).toMatchObject({
      ok: true,
      op: 'verify',
      result: { eventCount: events.length, headFingerprint: events.at(-1)?.fingerprintAfter },
    });
  });

  it('builds the report server-side only after submission', () => {
    const r = call(req('report', { events }));
    expect(r.ok && r.op === 'report' && r.result.report.resultLabel).toBe(
      'practical competency estimate',
    );
    const early = call(req('report', { events: events.slice(0, 3) }));
    expect(early).toMatchObject({ ok: false, error: { code: 'not_submitted' } });
  });

  it('rejects a tampered event chain with the divergence point', () => {
    const tampered = structuredClone(events);
    const target = tampered[4]!;
    target.envelope = { ...target.envelope, action: { type: 'request_hint' } };
    const r = call(req('verify', { events: tampered }));
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'event_chain_invalid', divergedAtSeq: 4 },
    });
  });

  it('rejects a discontinuous chain', () => {
    const gap = [...events.slice(0, 3), ...events.slice(4)];
    expect(call(req('verify', { events: gap }))).toMatchObject({
      ok: false,
      error: { code: 'event_chain_invalid' },
    });
  });

  it('rejects version mismatches', () => {
    for (const bad of [
      { ...expected, engineVersion: '9.9.9' },
      { ...expected, definitionVersion: '0.0.1' },
      { ...expected, assessmentVersion: '2.0.0' },
    ])
      expect(call({ ...req('initialize'), expected: bad })).toMatchObject({
        ok: false,
        error: { code: 'version_mismatch' },
      });
  });

  it('rejects malformed JSON and unknown operations', () => {
    const out = spawnSync(process.execPath, [CLI], { input: '{not json', encoding: 'utf8' });
    expect(JSON.parse(out.stdout)).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(call({ ...req('initialize'), op: 'delete_everything' })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
  });

  it('only allows system actions that match the automatic demonstration', () => {
    const manualSystem = {
      action: { type: 'request_hint' },
      actor: 'system',
      elapsedMs: 1,
      acknowledgedSafetyWarning: false,
    };
    expect(call(req('apply', { events: [], envelope: manualSystem }))).toMatchObject({
      ok: false,
      error: { code: 'system_action_not_permitted' },
    });
  });

  it('projects manual sessions with observable disclosure only', () => {
    const s = go(canonicalUntil(start(), 'add_dissolution_water'), {
      type: 'add_water',
      volume: { value: 10, unit: 'cm3' },
      source: 'tap',
    });
    const r = call(req('view', { events: s.events }));
    if (!(r.ok && r.op === 'view')) throw new Error('view failed');
    expect(r.result.view.disclosure).toBe('observable');
    expect(r.result.view.validity).toBeNull();
    expect(r.result.view.events.flatMap((e) => e.errors)).toEqual([]);
    expect(JSON.stringify(r.result.view)).not.toContain('TAP_WATER_USED');
    expect(JSON.stringify(r.result.view)).not.toContain('rngState');
  });
});
