import type { Action, PreconditionId, RejectionCode, SimulationState } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import { fingerprint, transition } from '../src';
import { act, canonicalUntil, cm3, ctx, doStep, g, go, start } from './helpers';

const required = [
  'volumetric_flask_250',
  'watch_glass',
  'funnel',
  'four_beam_balance',
  'wash_bottle',
];

describe('accepted transitions update state', () => {
  it('confirm_safety marks safety confirmed and advances the stage', () => {
    const s = doStep(start(), 'confirm_safety');
    expect(s.lab.safetyConfirmed).toBe(true);
    expect(s.lab.stage).toBe('setup');
  });

  it('select_apparatus selects items and sets the working flask capacity', () => {
    const s = go(doStep(start(), 'confirm_safety'), {
      type: 'select_apparatus',
      apparatusIds: required,
    });
    expect(s.lab.selectedApparatus).toEqual(required);
    expect(s.lab.workingFlaskId).toBe('volumetric_flask_250');
    expect(s.lab.flask.capacity).toEqual(cm3(250));
  });

  it('switching to another empty flask is allowed and resets flask contents', () => {
    let s = canonicalUntil(start(), 'clean_glassware');
    s = go(s, { type: 'select_apparatus', apparatusIds: ['volumetric_flask_100'] });
    expect(s.lab.workingFlaskId).toBe('volumetric_flask_100');
    expect(s.lab.flask.capacity).toEqual(cm3(100));
  });

  it('clean_glassware marks the listed glassware clean', () => {
    const s = canonicalUntil(start(), 'weigh_watch_glass');
    for (const id of ['volumetric_flask_250', 'watch_glass', 'funnel'])
      expect(s.lab.cleanliness[id]).toBe('clean');
  });

  it('weigh_watch_glass puts the watch glass on the pan and records w', () => {
    const before = canonicalUntil(start(), 'weigh_watch_glass');
    const r = act(before, { type: 'weigh_watch_glass' });
    expect(r.state.lab.balance.pan).toBe('watch_glass');
    expect(r.state.lab.balance.watchGlassReading).toEqual(before.lab.watchGlass.tareMass);
    expect(r.events[0]?.measurements).toEqual([
      { id: 'watch_glass_mass', quantity: before.lab.watchGlass.tareMass },
    ]);
    expect(r.state.lab.stage).toBe('weighing');
  });

  it('set_balance_sliders to (26.5 + w) g puts the pointer below zero', () => {
    const before = canonicalUntil(start(), 'set_balance_sliders');
    const w = before.lab.balance.watchGlassReading?.value ?? NaN;
    const r = act(before, { type: 'set_balance_sliders', mass: g(w + 26.5) });
    expect(r.state.lab.balance.sliderSetting?.value).toBeCloseTo(w + 26.5, 9);
    expect(r.events[0]?.observations).toContain('pointer_below_zero');
    expect(r.events[0]?.errors).toEqual([]);
  });

  it('accepts slider masses in kg via central unit conversion', () => {
    const before = canonicalUntil(start(), 'set_balance_sliders');
    const w = before.lab.balance.watchGlassReading?.value ?? NaN;
    const r = act(before, {
      type: 'set_balance_sliders',
      mass: { value: (w + 26.5) / 1000, unit: 'kg' },
    });
    expect(r.events[0]?.errors).toEqual([]);
  });

  it('add_solid until zero, remove_solid adjusts back', () => {
    const before = canonicalUntil(start(), 'add_solid');
    const r = act(before, { type: 'add_solid', mass: g(26.5), handContact: false });
    expect(r.state.lab.watchGlass.solid).toEqual(g(26.5));
    expect(r.events[0]?.observations).toContain('pointer_at_zero');
    const removed = go(r.state, { type: 'remove_solid', mass: g(1.5), handContact: false });
    expect(removed.lab.watchGlass.solid.value).toBeCloseTo(25, 12);
  });

  it('place_funnel / transfer_solid / rinses / remove_funnel move solute and water', () => {
    let s = canonicalUntil(start(), 'place_funnel');
    s = go(s, { type: 'place_funnel' });
    expect(s.lab.funnel.onFlask).toBe(true);
    s = go(s, { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false });
    expect(s.lab.transfer.started).toBe(true);
    expect(s.lab.balance.pan).toBe('empty');
    expect(s.lab.watchGlass.residue.value).toBeGreaterThan(0);
    expect(s.lab.funnel.residue.value).toBeGreaterThan(0);
    expect(s.lab.stage).toBe('transfer');
    s = go(s, { type: 'rinse_watch_glass', source: 'distilled' });
    expect(s.lab.watchGlass.residue.value).toBe(0);
    s = go(s, { type: 'rinse_funnel', source: 'distilled' });
    expect(s.lab.funnel.residue.value).toBe(0);
    expect(s.lab.flask.liquidVolume.value).toBe(20);
    expect(s.lab.flask.soluteUndissolved.value).toBeCloseTo(26.5, 12);
    s = go(s, { type: 'remove_funnel' });
    expect(s.lab.funnel.onFlask).toBe(false);
    expect(s.lab.transfer.closed).toBe(true);
    expect(s.lab.stage).toBe('dissolution');
  });

  it('stopper + dissolve_solute dissolves all solute; make-up and mixing follow', () => {
    let s = canonicalUntil(start(), 'dissolve_solute');
    const r = act(s, { type: 'dissolve_solute', grip: 'neck' });
    expect(r.state.lab.flask.soluteUndissolved.value).toBe(0);
    expect(r.state.lab.flask.soluteDissolved.value).toBeCloseTo(26.5, 12);
    expect(r.events[0]?.observations).toContain('solid_dissolved');
    s = canonicalUntil(r.state, 'adjust_to_mark');
    expect(s.lab.flask.liquidVolume.value).toBeCloseTo(248, 12);
    s = go(s, { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'level' });
    expect(s.lab.flask.madeUp).toBe(true);
    expect(s.lab.risks.homogeneity).toBe('not_mixed');
    expect(s.lab.stage).toBe('mixing');
    s = go(go(s, { type: 'stopper_flask', inserted: true }), {
      type: 'mix_solution',
      inversions: 10,
      grip: 'neck',
    });
    expect(s.lab.risks.homogeneity).toBe('homogeneous');
    expect(s.lab.stage).toBe('labelling');
  });

  it('request_hint increments hints without changing the laboratory state', () => {
    const s = canonicalUntil(start(), 'weigh_watch_glass');
    const r = act(s, { type: 'request_hint' });
    expect(r.state.lab).toEqual(s.lab);
    expect(r.state.meta.hints).toBe(1);
    expect(r.events[0]?.hintUsed).toBe(true);
    expect(r.feedback.map((f) => f.messageKey)).toContain('exp04.step.weigh_watch_glass.hint');
  });

  it('submit_experiment completes the session', () => {
    const s = go(canonicalUntil(start(), 'submit_experiment'), { type: 'submit_experiment' });
    expect(s.lab.submitted).toBe(true);
    expect(s.lab.stage).toBe('complete');
  });

  it('restart_experiment starts a fresh attempt deterministically', () => {
    const s = canonicalUntil(start(), 'transfer_solid');
    const r1 = act(s, { type: 'restart_experiment' });
    const r2 = act(s, { type: 'restart_experiment' });
    expect(r1.state).toEqual(r2.state);
    expect(r1.state.meta.attempt).toBe(2);
    expect(r1.state.meta.retries).toBe(1);
    expect(r1.state.lab.stage).toBe('safety');
    expect(r1.state.lab.selectedApparatus).toEqual([]);
    expect(r1.state.events).toHaveLength(s.events.length + 1);
  });
});

/** State builders for each physical rejection. */
const at = {
  fresh: () => start(),
  setup: () => canonicalUntil(start(), 'select_apparatus'),
  weighing: () => canonicalUntil(start(), 'weigh_watch_glass'),
  beforeAdd: () => canonicalUntil(start(), 'add_solid'),
  beforeFunnel: () => canonicalUntil(start(), 'place_funnel'),
  funnelOn: () => canonicalUntil(start(), 'transfer_solid'),
  afterTransfer: () => canonicalUntil(start(), 'rinse_watch_glass'),
  dissolving: () => canonicalUntil(start(), 'dissolve_solute'),
  beforeMakeUp: () => canonicalUntil(start(), 'add_water_near_mark'),
  madeUp: () => canonicalUntil(start(), 'stopper_for_mixing'),
  submitted: () => canonicalUntil(start(), 'end'),
};

const rejections: [string, () => SimulationState, Action, RejectionCode][] = [
  [
    'action after submission',
    at.submitted,
    { type: 'add_water', volume: cm3(1), source: 'distilled' },
    'not_submitted',
  ],
  [
    'unknown apparatus',
    at.setup,
    { type: 'select_apparatus', apparatusIds: ['bunsen_burner'] },
    'apparatus_known',
  ],
  [
    'clean unselected glassware',
    at.setup,
    { type: 'clean_glassware', apparatusIds: ['watch_glass'] },
    'apparatus_selected',
  ],
  [
    'clean non-glassware',
    at.weighing,
    { type: 'clean_glassware', apparatusIds: ['four_beam_balance'] },
    'glassware_cleanable_and_empty',
  ],
  [
    'clean flask that holds solution',
    at.afterTransfer,
    { type: 'clean_glassware', apparatusIds: ['volumetric_flask_250'] },
    'glassware_cleanable_and_empty',
  ],
  [
    'weigh without the balance selected',
    () => doStepSafe(),
    { type: 'weigh_watch_glass' },
    'apparatus_selected',
  ],
  [
    'add solid with no watch glass on pan',
    () => canonicalUntil(start(), 'weigh_watch_glass'),
    { type: 'add_solid', mass: g(1), handContact: false },
    'watch_glass_on_balance',
  ],
  [
    'remove more solid than present',
    at.beforeAdd,
    { type: 'remove_solid', mass: g(5), handContact: false },
    'sufficient_solid',
  ],
  [
    'place funnel with no flask selected',
    () => go(doStepSafe(), { type: 'select_apparatus', apparatusIds: ['funnel'] }),
    { type: 'place_funnel' },
    'flask_selected',
  ],
  ['place funnel twice', at.funnelOn, { type: 'place_funnel' }, 'funnel_not_on_flask'],
  [
    'transfer without the funnel',
    at.beforeFunnel,
    { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false },
    'funnel_on_flask',
  ],
  [
    'transfer from an empty watch glass',
    () => go(canonicalUntil(start(), 'add_solid'), { type: 'place_funnel' }),
    { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false },
    'solid_on_watch_glass',
  ],
  [
    'transfer twice',
    at.afterTransfer,
    { type: 'transfer_solid', fractionIntoFunnel: 1, handContact: false },
    'transfer_not_started',
  ],
  [
    're-weigh after transfer',
    at.afterTransfer,
    { type: 'weigh_watch_glass' },
    'transfer_not_started',
  ],
  [
    'rinse with no funnel on the flask',
    at.dissolving,
    { type: 'rinse_funnel', source: 'distilled' },
    'funnel_on_flask',
  ],
  ['remove funnel that is not there', at.dissolving, { type: 'remove_funnel' }, 'funnel_on_flask'],
  [
    'stopper with funnel in place',
    at.afterTransfer,
    { type: 'stopper_flask', inserted: true },
    'funnel_not_on_flask',
  ],
  [
    'add water to a stoppered flask',
    at.dissolving,
    { type: 'add_water', volume: cm3(10), source: 'distilled' },
    'flask_unstoppered',
  ],
  [
    'stopper an already stoppered flask',
    at.dissolving,
    { type: 'stopper_flask', inserted: true },
    'stopper_state_changes',
  ],
  [
    'shake an unstoppered flask',
    () => canonicalUntil(start(), 'stopper_for_dissolution'),
    { type: 'dissolve_solute', grip: 'neck' },
    'flask_stoppered',
  ],
  [
    'dissolve in an empty flask',
    () =>
      go(canonicalUntil(start(), 'weigh_watch_glass'), { type: 'stopper_flask', inserted: true }),
    { type: 'dissolve_solute', grip: 'neck' },
    'flask_has_liquid',
  ],
  [
    'dissolve with water but no solute',
    () =>
      go(go(at.weighing(), { type: 'add_water', volume: cm3(50), source: 'distilled' }), {
        type: 'stopper_flask',
        inserted: true,
      }),
    { type: 'dissolve_solute', grip: 'neck' },
    'flask_has_solute',
  ],
  [
    'adjust to mark when already made up',
    () => go(at.madeUp(), { type: 'add_water', volume: cm3(0), source: 'distilled' }),
    { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'level' },
    'below_mark',
  ],
  [
    'overfill beyond the brim',
    at.beforeMakeUp,
    { type: 'add_water', volume: cm3(1000), source: 'distilled' },
    'within_brim',
  ],
  [
    'mix an unstoppered flask',
    at.madeUp,
    { type: 'mix_solution', inversions: 10, grip: 'neck' },
    'flask_stoppered',
  ],
  [
    'switch flask after solute is in',
    at.afterTransfer,
    { type: 'select_apparatus', apparatusIds: ['volumetric_flask_500'] },
    'flask_switch_allowed',
  ],
  [
    'select two flasks at once',
    at.setup,
    { type: 'select_apparatus', apparatusIds: ['volumetric_flask_250', 'volumetric_flask_100'] },
    'flask_switch_allowed',
  ],
];

function doStepSafe(): SimulationState {
  return doStep(start(), 'confirm_safety');
}

describe('physically impossible actions are rejected without mutating state', () => {
  it.each(rejections)('%s → %s', (_name, build, action, code) => {
    const before = build();
    const r = act(before, action);
    const [event] = r.events;
    expect(event?.accepted).toBe(false);
    expect(event?.rejectionCode).toBe(code);
    expect(r.state.lab).toEqual(before.lab);
    expect(event?.fingerprintAfter).toBe(event?.fingerprintBefore);
    expect(fingerprint(r.state)).toBe(fingerprint(before));
    expect(event?.errors).toEqual([]);
    expect(r.state.events).toHaveLength(before.events.length + 1);
    expect(r.state.meta.nextSeq).toBe(before.meta.nextSeq + 1);
    expect(r.feedback).toEqual([
      {
        severity: 'error',
        messageKey: `engine.rejection.${code}`,
        errorCode: null,
        visibility: 'always',
      },
    ]);
  });

  it('covers every physical precondition declared in the definition', () => {
    const declared = new Set<PreconditionId>(
      ctx.definition.transitionRules.flatMap((r) => r.preconditions),
    );
    const tested = new Set(rejections.map(([, , , code]) => code));
    for (const p of declared) expect(tested.has(p), p).toBe(true);
  });

  it('rejects an envelope whose elapsed time goes backwards', () => {
    const s = canonicalUntil(start(), 'weigh_watch_glass');
    const r = transition(
      s,
      {
        action: { type: 'weigh_watch_glass' },
        actor: 'student',
        elapsedMs: 0,
        acknowledgedSafetyWarning: false,
      },
      ctx,
    );
    expect(r.events[0]?.rejectionCode).toBe('invalid_envelope');
    expect(r.state.lab).toEqual(s.lab);
  });

  it('does not mutate the input state object on accepted actions', () => {
    const s = canonicalUntil(start(), 'add_solid');
    const snapshot = JSON.parse(JSON.stringify(s)) as SimulationState;
    act(s, { type: 'add_solid', mass: g(26.5), handContact: false });
    expect(s).toEqual(snapshot);
  });
});

describe('domain events', () => {
  const final = canonicalUntil(start({ mode: 'guided', guidanceLevel: 'intermediate' }), 'end');

  it('are append-only with contiguous sequence numbers and chained fingerprints', () => {
    final.events.forEach((e, i) => {
      expect(e.seq).toBe(i);
      if (i > 0) expect(e.fingerprintBefore).toBe(final.events[i - 1]?.fingerprintAfter);
    });
  });

  it('carry session, mode, guidance level, elapsed time and source references', () => {
    for (const e of final.events) {
      expect(e.sessionId).toBe('test-session');
      expect(e.mode).toBe('guided');
      expect(e.guidanceLevel).toBe('intermediate');
      expect(e.elapsedMs).toBeGreaterThan(0);
      expect(e.sourceRefs.length).toBeGreaterThan(0);
    }
  });

  it('record measurements and provisional parameter IDs used', () => {
    const transfer = final.events.find((e) => e.envelope.action.type === 'transfer_solid');
    expect(transfer?.measurements[0]).toEqual({ id: 'weighed_solute_mass', quantity: g(26.5) });
    expect(transfer?.parameterIdsUsed).toEqual(
      expect.arrayContaining([
        'param.mass_tolerance',
        'param.watch_glass_residue_fraction',
        'param.funnel_residue_fraction',
      ]),
    );
  });
});
