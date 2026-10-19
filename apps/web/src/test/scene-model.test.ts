import type { Action, SessionView } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import { definition } from '../engine/content';
import { FLASK_MARK_Y, FLASK_NECK_TOP_Y, liquidHeight } from '../workbench/flaskProfile';
import { buildSceneModel, placementOf } from '../workbench/sceneModel';
import { makeLocalAdapter } from './helpers';

const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id);
const noUi = { pendingApparatus: [], focusedItem: null };

/** Runs actions through the offline adapter and returns the public projection. */
const run = async (mode: 'manual' | 'guided', actions: Action[]): Promise<SessionView> => {
  const adapter = makeLocalAdapter(3);
  const { session } = await adapter.createSession({
    mode,
    guidanceLevel: mode === 'guided' ? 'advanced' : null,
    locale: 'en',
    preLab: null,
  });
  let view = session;
  for (const action of actions) {
    view = (
      await adapter.submitAction(view.sessionId, {
        clientActionId: crypto.randomUUID(),
        expectedSequence: view.nextSequence,
        envelope: { action, actor: 'student', acknowledgedSafetyWarning: true },
      })
    ).session;
  }
  return view;
};

const base: Action[] = [
  { type: 'confirm_safety', checklistItemIds: checklist },
  { type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] },
  { type: 'add_water', volume: { value: 249, unit: 'cm3' }, source: 'distilled' },
];

describe('scene model (pure mapping of the public projection)', () => {
  it('reflects the projection and highlights picked items', async () => {
    const view = await run('manual', base);
    const m = buildSceneModel(view, definition, {
      pendingApparatus: ['funnel'],
      focusedItem: null,
    });
    expect(m.items.find((i) => i.id === 'funnel')?.highlighted).toBe(true);
    expect(m.items.find((i) => i.id === 'volumetric_flask_250')?.onBench).toBe(true);
    expect(m.levelObservation).toBe('liquid_below_mark');
    expect(m.liquidLevel).toBeGreaterThan(0.99);
    expect(m.liquidLevel).toBeLessThan(1);
  });

  it('does not reveal a parallax error in manual mode: a judged-at-mark flask is drawn at the mark', async () => {
    const view = await run('manual', [
      ...base,
      { type: 'adjust_to_mark', source: 'distilled', eyeLevel: 'above' },
    ]);
    const m = buildSceneModel(view, definition, noUi);
    expect(m.liquidLevel).toBe(1);
    expect(m.levelObservation).toBe('meniscus_at_mark');
    expect(JSON.stringify(view)).not.toContain('EYE_LEVEL_INCORRECT');
  });

  it('shows the validity marker only when the projection discloses validity', async () => {
    const tap: Action[] = [
      base[0]!,
      base[1]!,
      { type: 'add_water', volume: { value: 10, unit: 'cm3' }, source: 'tap' },
    ];
    expect(buildSceneModel(await run('manual', tap), definition, noUi).warning).toBe(false);
    expect(buildSceneModel(await run('guided', tap), definition, noUi).warning).toBe(true);
  });
});

describe('scene model: shared visual descriptors for both renderers', () => {
  const weighed: Action[] = [
    base[0]!,
    {
      type: 'select_apparatus',
      apparatusIds: ['watch_glass', 'four_beam_balance', 'funnel', 'volumetric_flask_250'],
    },
    { type: 'weigh_watch_glass' },
  ];

  it('places items by engine state: shelf, bench, balance pan and flask neck', async () => {
    const m = buildSceneModel(
      await run('manual', [...weighed, { type: 'place_funnel' }]),
      definition,
      noUi,
    );
    const where = (id: string) =>
      placementOf(
        m.items.find((i) => i.id === id)!,
        m,
      );
    expect(where('watch_glass')).toBe('on_balance');
    expect(where('funnel')).toBe('on_flask');
    expect(where('four_beam_balance')).toBe('bench');
    expect(where('beaker')).toBe('shelf');
    expect(where('reagent_na2co3')).toBe('bench');
  });

  it('takes the balance pointer from the latest engine observation, only while weighing', async () => {
    const m = buildSceneModel(
      await run('manual', [
        ...weighed,
        { type: 'set_balance_sliders', mass: { value: 40, unit: 'g' } },
      ]),
      definition,
      noUi,
    );
    expect(m.balance.pointer).not.toBeNull();
    expect(m.balance.watchGlassReading).not.toBeNull();
    const before = buildSceneModel(await run('manual', base), definition, noUi);
    expect(before.balance.pointer).toBeNull();
  });

  it('carries cleanliness, flask scale and the reagent formula from public data', async () => {
    const m = buildSceneModel(await run('manual', base), definition, noUi);
    const flask = (id: string) => m.items.find((i) => i.id === id)!;
    expect(flask('volumetric_flask_100').scale).toBeLessThan(flask('volumetric_flask_250').scale);
    expect(flask('volumetric_flask_250').scale).toBeLessThan(flask('volumetric_flask_500').scale);
    expect(flask('volumetric_flask_250').cleanliness).not.toBeUndefined();
    expect(m.reagentFormula).toBe('Na₂CO₃');
  });
});

describe('flask profile (display scale only)', () => {
  it('maps the projection level to a monotonic height with the mark at 1', () => {
    expect(liquidHeight(0)).toBe(0);
    let previous = 0;
    for (let f = 0.05; f < 1; f += 0.05) {
      const h = liquidHeight(f);
      expect(h).toBeGreaterThan(previous);
      expect(h).toBeLessThan(FLASK_MARK_Y);
      previous = h;
    }
    expect(liquidHeight(1)).toBe(FLASK_MARK_Y);
  });

  it('keeps an overshoot visible above the mark but inside the neck', () => {
    expect(liquidHeight(1.02)).toBeGreaterThan(FLASK_MARK_Y);
    expect(liquidHeight(1.1)).toBeLessThan(FLASK_NECK_TOP_Y);
    expect(liquidHeight(5)).toBe(liquidHeight(1.1));
  });
});
