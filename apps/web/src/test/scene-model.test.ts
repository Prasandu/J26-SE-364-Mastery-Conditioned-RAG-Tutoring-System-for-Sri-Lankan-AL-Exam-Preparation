import type { Action, SessionView } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import { definition } from '../engine/content';
import { buildSceneModel } from '../workbench/sceneModel';
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
