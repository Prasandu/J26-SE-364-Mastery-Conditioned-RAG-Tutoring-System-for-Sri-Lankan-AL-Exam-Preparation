import { describe, expect, it, vi } from 'vitest';
import { EngineError } from '../engine/adapter';
import { definition } from '../engine/content';
import { createSessionStore } from '../store/sessionStore';
import { acknowledgeAllSafety, makeLocalAdapter, makeStore, startSession } from './helpers';

const strip = (s: ReturnType<ReturnType<typeof makeStore>['getState']>) => {
  const { locale: _l, ...rest } = s;
  void _l;
  return JSON.parse(JSON.stringify({ ...rest, engine: undefined })) as unknown;
};

describe('session creation and pre-lab gating', () => {
  it('guided and manual work require the full safety acknowledgement', async () => {
    const store = makeStore();
    store.getState().selectMode('manual', null);
    expect(store.getState().canStart()).toBe(false);
    expect(await store.getState().createSession()).toBe(false);
    expect(store.getState().session).toBeNull();
    acknowledgeAllSafety(store);
    expect(store.getState().canStart()).toBe(true);
  });

  it('the automatic demonstration can start without pre-lab answers or acknowledgement', async () => {
    const store = makeStore();
    store.getState().selectMode('automatic', null);
    await store.getState().createSession();
    expect(store.getState().session?.mode).toBe('automatic');
    expect(store.getState().session?.events).toEqual([]);
  });

  it('freezes mode and level and records the acknowledgement as the first action', async () => {
    const store = makeStore();
    const s = await startSession(store, 'guided', 'intermediate');
    expect(s.mode).toBe('guided');
    expect(s.guidanceLevel).toBe('intermediate');
    expect(s.events[0]?.action).toEqual({
      type: 'confirm_safety',
      checklistItemIds: expect.any(Array),
    });
    expect(s.events[0]?.errors).toEqual([]);
    expect(store.getState().view).toBe('workbench');
  });

  it('pre-lab answers survive navigation', () => {
    const store = makeStore();
    store.getState().savePreLabAnswer('q2', 'amount ÷ volume');
    store.getState().setPrediction('a clear solution');
    for (const v of ['overview', 'library', 'mode', 'prelab'] as const)
      store.getState().navigate(v);
    expect(store.getState().preLab.answers).toEqual({ q2: 'amount ÷ volume' });
    expect(store.getState().preLab.prediction).toBe('a clear solution');
  });
});

describe('dispatch goes through the adapter only', () => {
  it('stores exactly the adapter response, with a fresh client action ID and the expected sequence', async () => {
    const adapter = makeLocalAdapter();
    const submit = vi.spyOn(adapter, 'submitAction');
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    await store
      .getState()
      .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] });
    expect(submit).toHaveBeenCalledTimes(2); // confirm_safety + select_apparatus
    const [sessionId, request] = submit.mock.calls[1]!;
    expect(sessionId).toBe(store.getState().session?.sessionId);
    expect(request).toMatchObject({
      expectedSequence: 1,
      envelope: { actor: 'student', acknowledgedSafetyWarning: false },
    });
    expect(request.clientActionId).toMatch(/^[0-9a-f-]{36}$/);
    const response = await submit.mock.results[1]!.value;
    expect(store.getState().session).toEqual(response.session);
    expect(store.getState().feedback).toEqual(response.feedback);
  });

  it('records accepted and rejected actions with feedback', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    expect(await store.getState().dispatchLabAction({ type: 'remove_funnel' })).toBe('rejected');
    expect(store.getState().log.at(-1)).toMatchObject({
      kind: 'rejected',
      messageKey: 'engine.rejection.funnel_on_flask',
    });
    expect(
      await store
        .getState()
        .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['watch_glass'] }),
    ).toBe('accepted');
  });

  it('a pending request blocks duplicate submissions', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = adapter.submitAction.bind(adapter);
    const submit = vi.spyOn(adapter, 'submitAction').mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const first = store.getState().dispatchLabAction({ type: 'request_hint' });
    expect(store.getState().ui.busy).toBe(true);
    expect(await store.getState().dispatchLabAction({ type: 'request_hint' })).toBe('busy');
    release();
    expect(await first).toBe('accepted');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('language switching preserves the full session', () => {
  it('only the locale changes', async () => {
    const store = makeStore();
    store.getState().savePreLabAnswer('q1', 'mass fraction');
    const s = await startSession(store, 'guided', 'advanced');
    await store.getState().dispatchLabAction({
      type: 'select_apparatus',
      apparatusIds: ['volumetric_flask_250', 'watch_glass'],
    });
    store.getState().pickItem('funnel');
    store.getState().editNotebook((d) => ({ ...d, observations: 'Clear, colourless solution' }));
    const before = strip(store.getState());
    store.getState().setLocale('si');
    expect(store.getState().locale).toBe('si');
    expect(strip(store.getState())).toEqual(before);
    expect(store.getState().notebook.draft?.observations).toBe('Clear, colourless solution');
    expect(store.getState().session?.sessionId).toBe(s.sessionId);
  });
});

describe('mode changes', () => {
  it('changing mode during a session needs confirmation and starts a new session', async () => {
    const store = makeStore();
    const first = await startSession(store, 'guided', 'beginner');
    store.getState().requestModeChange('manual', null);
    expect(store.getState().ui.pending).toEqual({
      kind: 'mode_change',
      mode: 'manual',
      guidanceLevel: null,
    });
    expect(store.getState().session?.sessionId).toBe(first.sessionId);
    await store.getState().confirmPending();
    expect(store.getState().session?.sessionId).not.toBe(first.sessionId);
    expect(store.getState().session?.mode).toBe('manual');
  });
});

describe('guided confirmation and safety acknowledgement', () => {
  it('beginner: a predicted error asks for confirmation before anything is dispatched', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'beginner');
    await store.getState().dispatchLabAction({
      type: 'select_apparatus',
      apparatusIds: ['four_beam_balance', 'watch_glass'],
    });
    await store.getState().dispatchLabAction({ type: 'weigh_watch_glass' });
    const events = store.getState().session!.events.length;
    expect(
      await store
        .getState()
        .dispatchLabAction({ type: 'set_balance_sliders', mass: { value: 5, unit: 'g' } }),
    ).toBe('needs_confirmation');
    expect(store.getState().ui.pending).toMatchObject({
      kind: 'predicted_errors',
      errorCodes: ['SLIDER_SETTING_INCORRECT'],
    });
    expect(store.getState().session!.events.length).toBe(events);
    await store.getState().confirmPending();
    expect(
      store
        .getState()
        .session!.events.at(-1)
        ?.errors.map((e) => e.code),
    ).toEqual(['SLIDER_SETTING_INCORRECT']);
  });

  it('intermediate: unsafe action needs acknowledgement, then records a safety violation', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'intermediate');
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['four_beam_balance', 'watch_glass'] },
      { type: 'clean_glassware' as const, apparatusIds: ['watch_glass'] },
      { type: 'weigh_watch_glass' as const },
    ])
      await store.getState().dispatchLabAction(a);
    expect(
      await store
        .getState()
        .dispatchLabAction({ type: 'add_solid', mass: { value: 1, unit: 'g' }, handContact: true }),
    ).toBe('needs_confirmation');
    expect(store.getState().ui.pending).toMatchObject({
      kind: 'safety',
      errorCodes: ['CHEMICAL_SKIN_CONTACT'],
    });
    await store.getState().confirmPending();
    const last = store.getState().session!.events.at(-1)!;
    expect(last.accepted).toBe(true);
    expect(last.errors.map((e) => e.category)).toEqual(['safety_violation']);
  });
});

describe('disclosure by mode', () => {
  const tapWater = async (mode: 'manual' | 'guided', level: 'advanced' | null) => {
    const store = makeStore();
    await startSession(store, mode, level);
    await store
      .getState()
      .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] });
    await store
      .getState()
      .dispatchLabAction({ type: 'add_water', volume: { value: 10, unit: 'cm3' }, source: 'tap' });
    return store.getState();
  };

  it('manual mode never receives technique errors before the report', async () => {
    const s = await tapWater('manual', null);
    expect(s.feedback.some((f) => f.errorCode === 'TAP_WATER_USED')).toBe(false);
    expect(JSON.stringify(s.session)).not.toContain('TAP_WATER_USED');
    expect(s.session?.disclosure).toBe('observable');
    expect(s.session?.validity).toBeNull();
  });

  it('guided mode receives the same error', async () => {
    const s = await tapWater('guided', 'advanced');
    expect(s.feedback.some((f) => f.errorCode === 'TAP_WATER_USED')).toBe(true);
  });

  it.each([
    ['manual', null],
    ['guided', 'advanced'],
  ] as const)('safety warnings stay visible in %s mode', async (mode, level) => {
    const store = makeStore();
    await startSession(store, mode, level);
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['four_beam_balance', 'watch_glass'] },
      { type: 'weigh_watch_glass' as const },
      { type: 'add_solid' as const, mass: { value: 1, unit: 'g' as const }, handContact: true },
    ])
      await store.getState().dispatchLabAction(a);
    expect(store.getState().feedback.some((f) => f.severity === 'safety')).toBe(true);
  });
});

describe('automatic demonstration', () => {
  it('advances one engine step at a time as system actions and completes the canonical run', async () => {
    const store = makeStore();
    await startSession(store, 'automatic');
    expect(await store.getState().advanceAutomaticDemo()).toBe('accepted');
    expect(store.getState().session!.events[0]?.actor).toBe('system');
    let guard = 0;
    while ((await store.getState().advanceAutomaticDemo()) === 'accepted' && guard++ < 50);
    const s = store.getState().session!;
    expect(s.status).toBe('submitted');
    expect(s.events.every((e) => e.actor === 'system' && e.accepted)).toBe(true);
    expect(s.events.flatMap((e) => e.errors)).toEqual([]);
    expect(await store.getState().advanceAutomaticDemo()).toBe('complete');
  });

  it('restart in automatic mode is the learner’s action and starts attempt 2', async () => {
    const store = makeStore();
    await startSession(store, 'automatic');
    await store.getState().advanceAutomaticDemo();
    expect(await store.getState().dispatchLabAction({ type: 'restart_experiment' })).toBe(
      'accepted',
    );
    expect(store.getState().session!.attempt).toBe(2);
  });
});

describe('connectivity and retries', () => {
  it('a failed request shows a retryable error; retry resends the same client action ID', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    const original = adapter.submitAction.bind(adapter);
    const submit = vi
      .spyOn(adapter, 'submitAction')
      .mockRejectedValueOnce(new EngineError('network_unavailable', null, true));
    expect(await store.getState().dispatchLabAction({ type: 'request_hint' })).toBe('failed');
    expect(store.getState().connection).toMatchObject({
      code: 'network_unavailable',
      retryable: true,
    });
    const failedId = submit.mock.calls[0]![1].clientActionId;
    submit.mockImplementation(original);
    expect(await store.getState().retryLastAction()).toBe('accepted');
    expect(submit.mock.calls[1]![1].clientActionId).toBe(failedId);
    expect(store.getState().connection).toBeNull();
  });

  it('there is no silent switch to another adapter after a failure', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    vi.spyOn(adapter, 'submitAction').mockRejectedValue(
      new EngineError('verifier_unavailable', 503, true),
    );
    await store.getState().dispatchLabAction({ type: 'request_hint' });
    expect(store.getState().engine).toBe(adapter);
    expect(store.getState().session?.nextSequence).toBe(1);
    expect(store.getState().connection?.code).toBe('verifier_unavailable');
  });
});

describe('notebook', () => {
  it('saves with the expected version and keeps later edits unsaved', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().editNotebook((d) => ({ ...d, aim: 'Prepare a standard solution' }));
    const saving = store.getState().saveNotebook();
    store.getState().editNotebook((d) => ({ ...d, aim: 'Prepare a standard Na₂CO₃ solution' }));
    await saving;
    expect(store.getState().notebook).toMatchObject({ savedVersion: 1, status: 'unsaved' });
    expect(store.getState().notebook.draft?.aim).toBe('Prepare a standard Na₂CO₃ solution');
    await store.getState().saveNotebook();
    expect(store.getState().notebook).toMatchObject({ savedVersion: 2, status: 'saved' });
  });

  it('a stale save reports a conflict instead of overwriting newer work', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    const session = await startSession(store, 'manual');
    store.getState().editNotebook((d) => ({ ...d, aim: 'mine' }));
    await adapter.saveNotebook(session.sessionId, {
      expectedVersion: 0,
      document: store.getState().notebook.draft!,
    });
    await store.getState().saveNotebook();
    expect(store.getState().notebook).toMatchObject({
      status: 'conflict',
      conflictVersion: 1,
      savedVersion: 0,
    });
    await store.getState().saveNotebook({ overwrite: true });
    expect(store.getState().notebook).toMatchObject({ status: 'saved', savedVersion: 2 });
  });
});

describe('report', () => {
  it('is unavailable before submission and built by the engine after', async () => {
    const store = makeStore();
    await startSession(store, 'automatic');
    await store.getState().loadReport();
    expect(store.getState().report.status).toBe('unavailable');
    let guard = 0;
    while ((await store.getState().advanceAutomaticDemo()) === 'accepted' && guard++ < 50);
    await store.getState().loadReport();
    expect(store.getState().report.status).toBe('ready');
    expect(store.getState().report.data?.resultLabel).toBe('practical competency estimate');
  });
});

describe('all five profiles share one engine', () => {
  it('identical action sequences give identical laboratory state', async () => {
    const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id);
    const actions = [
      { type: 'confirm_safety' as const, checklistItemIds: checklist },
      {
        type: 'select_apparatus' as const,
        apparatusIds: ['volumetric_flask_250', 'four_beam_balance', 'watch_glass'],
      },
      { type: 'weigh_watch_glass' as const },
      { type: 'add_solid' as const, mass: { value: 3, unit: 'g' as const }, handContact: true },
      {
        type: 'add_water' as const,
        volume: { value: 20, unit: 'cm3' as const },
        source: 'tap' as const,
      },
    ];
    const profiles = [
      ['automatic', null],
      ['guided', 'beginner'],
      ['guided', 'intermediate'],
      ['guided', 'advanced'],
      ['manual', null],
    ] as const;
    const benches = [];
    for (const [mode, level] of profiles) {
      const store = makeStore(7);
      await startSession(store, mode, level);
      for (const action of actions)
        await store
          .getState()
          .dispatchLabAction(action, { confirmed: true, acknowledgeSafety: true });
      benches.push({
        bench: store.getState().session!.bench,
        stage: store.getState().session!.stage,
      });
    }
    for (const b of benches.slice(1)) expect(b).toEqual(benches[0]);
  });
});

describe('store construction', () => {
  it('accepts any adapter implementing the interface', () => {
    const store = createSessionStore({ adapter: makeLocalAdapter() });
    expect(store.getState().engine.kind).toBe('local');
  });
});
