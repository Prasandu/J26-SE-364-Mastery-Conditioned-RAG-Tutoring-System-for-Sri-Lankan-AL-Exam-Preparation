import type { Action } from '@vlab/contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { definition } from '../engine/content';
import { resources } from '../i18n';
import {
  BENCH_TARGET,
  ITEM_ACTIONS,
  menuAction,
  resolveGesture,
} from '../workbench/interaction/gestures';
import { buildSceneModel, type SceneModel } from '../workbench/sceneModel';
import { makeLocalAdapter, makeStore, renderApp, startSession } from './helpers';

const tx = (k: string) => resources.en.translation[k] ?? k;
const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id);
const svgItem = (id: string) => document.querySelector(`[data-lab-item="${id}"]`) as SVGGElement;

const modelAfter = async (actions: Action[]): Promise<SceneModel> => {
  const adapter = makeLocalAdapter(3);
  let { session } = await adapter.createSession({
    mode: 'manual',
    guidanceLevel: null,
    locale: 'en',
    preLab: null,
  });
  for (const action of actions)
    session = (
      await adapter.submitAction(session.sessionId, {
        clientActionId: crypto.randomUUID(),
        expectedSequence: session.nextSequence,
        envelope: { action, actor: 'student', acknowledgedSafetyWarning: true },
      })
    ).session;
  return buildSceneModel(session, definition, { pendingApparatus: [], focusedItem: null });
};

const dispatchAll = async (store: ReturnType<typeof makeStore>, actions: Action[]) => {
  for (const a of actions)
    await act(async () => {
      await store.getState().dispatchLabAction(a, { confirmed: true, acknowledgeSafety: true });
    });
};

const onBench: Action[] = [
  { type: 'confirm_safety', checklistItemIds: checklist },
  {
    type: 'select_apparatus',
    apparatusIds: [
      'watch_glass',
      'four_beam_balance',
      'funnel',
      'volumetric_flask_250',
      'wash_bottle',
    ],
  },
];

describe('gesture table (presentation only; maps to existing actions)', () => {
  it('resolves source → target gestures to the existing typed actions', async () => {
    const m = await modelAfter(onBench);
    const item = (id: string) => m.items.find((i) => i.id === id)!;
    expect(resolveGesture(item('watch_glass'), item('four_beam_balance'), m)).toEqual({
      kind: 'dispatch',
      action: { type: 'weigh_watch_glass' },
    });
    expect(resolveGesture(item('reagent_na2co3'), item('watch_glass'), m)).toEqual({
      kind: 'form',
      type: 'add_solid',
    });
    expect(resolveGesture(item('funnel'), item('volumetric_flask_250'), m)).toEqual({
      kind: 'dispatch',
      action: { type: 'place_funnel' },
    });
    expect(resolveGesture(item('wash_bottle'), item('volumetric_flask_250'), m)).toEqual({
      kind: 'form',
      type: 'add_water',
    });
    expect(resolveGesture(item('watch_glass'), item('funnel'), m)).toEqual({
      kind: 'form',
      type: 'transfer_solid',
    });
    // The flask that is not in use cannot receive the funnel; nothing is dispatched.
    expect(resolveGesture(item('funnel'), item('volumetric_flask_500'), m).kind).toBe('none');
    // A shelf item dropped on the bench is the existing selection action.
    expect(resolveGesture(item('beaker'), BENCH_TARGET, m)).toEqual({
      kind: 'dispatch',
      action: { type: 'select_apparatus', apparatusIds: ['beaker'] },
    });
    expect(resolveGesture(item('wash_bottle'), item('four_beam_balance'), m).kind).toBe('none');
  });

  it('item menus are static per apparatus kind (never state- or mode-dependent hints)', async () => {
    const early = await modelAfter([]);
    const late = await modelAfter([...onBench, { type: 'weigh_watch_glass' }]);
    for (const m of [early, late])
      for (const item of m.items) expect(ITEM_ACTIONS[item.kind].length).toBeGreaterThan(0);
    const flask = late.items.find((i) => i.id === 'volumetric_flask_250')!;
    expect(menuAction('clean_glassware', flask, late, [])).toEqual({
      kind: 'dispatch',
      action: { type: 'clean_glassware', apparatusIds: ['volumetric_flask_250'] },
    });
    expect(menuAction('stopper_flask', flask, late, [])).toEqual({
      kind: 'dispatch',
      action: { type: 'stopper_flask', inserted: true },
    });
    expect(menuAction('mix_solution', flask, late, []).kind).toBe('form');
  });
});

describe('laboratory stage interaction', () => {
  it('equipment tray shows the same apparatus pictures as the laboratory', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('materials'); // the equipment tray is the Materials section now
    renderApp(store);
    const tray = screen.getByRole('region', { name: tx('ui.equipment.title') });
    expect(within(tray).getAllByRole('checkbox').length).toBe(definition.apparatus.length);
    expect(tray.querySelectorAll('.apparatus-thumb').length).toBe(definition.apparatus.length + 1);
  });

  it('clicking an item opens its menu; "take to the bench" dispatches select_apparatus', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    await user.click(svgItem('watch_glass'));
    const menu = screen.getByRole('region', { name: tx('exp04.apparatus.watch_glass') });
    await user.click(within(menu).getByRole('button', { name: tx('ui.stage.take_to_bench') }));
    await waitFor(() =>
      expect(svgItem('watch_glass').getAttribute('data-placement')).toBe('bench'),
    );
    expect(store.getState().session!.events.at(-1)?.action).toEqual({
      type: 'select_apparatus',
      apparatusIds: ['watch_glass'],
    });
  });

  it('pick up the watch glass and click the balance: the engine weighs it and the drawing follows', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, onBench);
    const { user } = renderApp(store);
    await user.click(svgItem('watch_glass'));
    await user.click(screen.getByRole('button', { name: tx('ui.stage.pick_up') }));
    expect(svgItem('watch_glass').getAttribute('class')).toContain('lab2d-item--held');
    // Nothing is dispatched until the target is chosen.
    const events = store.getState().session!.events.length;
    expect(store.getState().session!.events.length).toBe(events);
    await user.click(svgItem('four_beam_balance'));
    await waitFor(() =>
      expect(svgItem('watch_glass').getAttribute('data-placement')).toBe('on_balance'),
    );
    const last = store.getState().session!.events.at(-1)!;
    expect(last.action).toEqual({ type: 'weigh_watch_glass' });
    expect(last.accepted).toBe(true);
  });

  it('keyboard path: pick up, then choose a target from the list', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, onBench);
    const { user } = renderApp(store);
    svgItem('funnel').focus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: tx('ui.stage.pick_up') }));
    const targets = screen.getByRole('list', { name: tx('ui.stage.targets') });
    await user.click(
      within(targets).getByRole('button', {
        name: tx('ui.stage.place_on').replace(
          '{{name}}',
          tx('exp04.apparatus.volumetric_flask_250'),
        ),
      }),
    );
    await waitFor(() => expect(svgItem('funnel').getAttribute('data-placement')).toBe('on_flask'));
  });

  it('a gesture with no defined effect shows a notice and dispatches nothing', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, onBench);
    const { user } = renderApp(store);
    const events = store.getState().session!.events.length;
    await user.click(svgItem('wash_bottle'));
    await user.click(screen.getByRole('button', { name: tx('ui.stage.pick_up') }));
    await user.click(svgItem('four_beam_balance'));
    expect(await screen.findByText(tx('ui.gesture.no_effect'))).toBeInTheDocument();
    expect(store.getState().session!.events.length).toBe(events);
  });

  it('an engine rejection is shown and the drawing does not change', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, [
      { type: 'confirm_safety', checklistItemIds: checklist },
      { type: 'select_apparatus', apparatusIds: ['watch_glass'] },
    ]);
    const { user } = renderApp(store);
    await user.click(svgItem('watch_glass'));
    await user.click(screen.getByRole('button', { name: tx('ui.stage.pick_up') }));
    // The balance is still on the shelf: the engine rejects weighing.
    await user.click(svgItem('four_beam_balance'));
    await waitFor(() => expect(store.getState().session!.events.at(-1)?.accepted).toBe(false));
    expect(svgItem('watch_glass').getAttribute('data-placement')).toBe('bench');
    expect(document.querySelector('.stage-toast--rejected')).not.toBeNull();
  });

  it('a gesture that needs input opens the normal form on the stage, which closes after the action', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, [...onBench, { type: 'weigh_watch_glass' }]);
    const { user } = renderApp(store);
    await user.click(svgItem('reagent_na2co3'));
    await user.click(screen.getByRole('button', { name: tx('ui.stage.pick_up') }));
    await user.click(svgItem('watch_glass'));
    const form = document.getElementById('stage-action-form-add_solid')!;
    expect(form).not.toBeNull();
    await user.type(within(form).getByLabelText(tx('ui.form.solid_mass')), '5');
    await user.click(within(form).getByLabelText(tx('ui.choice.handling.no_contact')));
    await user.click(within(form).getByRole('button', { name: tx('exp04.action.add_solid') }));
    await waitFor(() =>
      expect(store.getState().session!.events.at(-1)?.action.type).toBe('add_solid'),
    );
    await waitFor(() => expect(document.getElementById('stage-action-form-add_solid')).toBeNull());
  });

  it('guided beginner marks the suggested action in the item menu; manual marks nothing', async () => {
    const guided = makeStore();
    await startSession(guided, 'guided', 'beginner');
    await dispatchAll(guided, [{ type: 'confirm_safety', checklistItemIds: checklist }]);
    const first = renderApp(guided);
    await first.user.click(svgItem('watch_glass'));
    const suggested = guided.getState().session!.guidance.suggestedAction;
    expect(suggested).not.toBeNull();
    expect(document.querySelectorAll('.stage-dock .is-suggested').length).toBeLessThanOrEqual(1);
    first.unmount();

    const manual = makeStore();
    await startSession(manual, 'manual');
    const second = renderApp(manual);
    await second.user.click(svgItem('watch_glass'));
    expect(document.querySelectorAll('.stage-dock .is-suggested').length).toBe(0);
  });

  it('automatic mode offers no stage controls (the system performs the steps)', async () => {
    const store = makeStore();
    await startSession(store, 'automatic');
    const { user } = renderApp(store);
    await user.click(svgItem('watch_glass'));
    expect(screen.queryByRole('button', { name: tx('ui.stage.pick_up') })).toBeNull();
    expect(screen.getByText(tx('ui.stage.caption_automatic'))).toBeInTheDocument();
  });
});
