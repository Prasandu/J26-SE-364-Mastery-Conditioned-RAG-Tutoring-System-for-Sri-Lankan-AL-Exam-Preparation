import type { Action } from '@vlab/contracts';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { definition } from '../engine/content';
import { resources } from '../i18n';
import type { SceneModel } from '../workbench/sceneModel';
import { makeLocalAdapter, makeStore, renderApp, startSession } from './helpers';

// Test boundary: jsdom has no WebGL, so the 3D renderer is replaced by a probe that exposes the
// placements it would draw, computed from the model it receives through the shared contract.
vi.mock('../workbench/LabCanvas', async () => {
  const { placementOf } = await import('../workbench/sceneModel');
  return {
    LabCanvas: ({ model, onPick }: { model: SceneModel; onPick: (id: string) => void }) => (
      <div
        data-testid="renderer-3d"
        data-placements={JSON.stringify(
          Object.fromEntries(model.items.map((i) => [i.id, placementOf(i, model)])),
        )}
        data-selected={model.items
          .filter((i) => i.highlighted)
          .map((i) => i.id)
          .join(',')}
      >
        <button type="button" onClick={() => onPick('funnel')}>
          3d-pick-funnel
        </button>
      </div>
    ),
  };
});

const tx = (k: string) => resources.en.translation[k] ?? k;
const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist').map((r) => r.id);

const svgItem = (id: string) => document.querySelector(`[data-lab-item="${id}"]`) as SVGGElement;
const placements2D = () =>
  Object.fromEntries(
    [...document.querySelectorAll('[data-lab-item]')].map((el) => [
      el.getAttribute('data-lab-item'),
      el.getAttribute('data-placement'),
    ]),
  );
const placements3D = () =>
  JSON.parse(screen.getByTestId('renderer-3d').getAttribute('data-placements')!) as Record<
    string,
    string
  >;

const dispatchAll = async (store: ReturnType<typeof makeStore>, actions: Action[]) => {
  for (const a of actions)
    await act(async () => {
      await store.getState().dispatchLabAction(a, { confirmed: true, acknowledgeSafety: true });
    });
};

describe('2D/3D renderer switching', () => {
  it('defaults to 2D and switches without dispatching any engine action or touching the session', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'guided', 'beginner');
    await dispatchAll(store, [
      { type: 'confirm_safety', checklistItemIds: checklist },
      { type: 'select_apparatus', apparatusIds: ['watch_glass', 'four_beam_balance'] },
    ]);
    store.getState().editNotebook((doc) => ({ ...doc, aim: 'My aim' }));
    const submit = vi.spyOn(adapter, 'submitAction');
    const preview = vi.spyOn(adapter, 'previewAction');
    const before = store.getState();
    const { user } = renderApp(store);

    expect(store.getState().labView).toBe('2d');
    expect(document.querySelector('[data-renderer="2d"]')).not.toBeNull();
    for (const view of ['ui.lab.renderer_3d', 'ui.lab.renderer_2d', 'ui.lab.renderer_3d'])
      await user.click(screen.getByRole('button', { name: tx(view) }));

    expect(store.getState().labView).toBe('3d');
    expect(screen.getByRole('button', { name: tx('ui.lab.renderer_3d') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(submit).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
    const after = store.getState();
    expect(after.session).toBe(before.session);
    expect(after.log).toBe(before.log);
    expect(after.notebook).toBe(before.notebook);
    expect(after.notebook.draft?.aim).toBe('My aim');
    expect(after.session?.stage).toBe(before.session?.stage);
  });

  it('both renderers receive the same placements, before and after a verified state change', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    const snapshot = async () => {
      const p2 = placements2D();
      await user.click(screen.getByRole('button', { name: tx('ui.lab.renderer_3d') }));
      const p3 = placements3D();
      await user.click(screen.getByRole('button', { name: tx('ui.lab.renderer_2d') }));
      return [p2, p3] as const;
    };

    const [initial2D, initial3D] = await snapshot();
    expect(initial3D).toEqual(initial2D);
    expect(initial2D.watch_glass).toBe('shelf');
    expect(initial2D.reagent_na2co3).toBe('bench');

    await dispatchAll(store, [
      { type: 'confirm_safety', checklistItemIds: checklist },
      { type: 'select_apparatus', apparatusIds: ['watch_glass', 'four_beam_balance'] },
      { type: 'weigh_watch_glass' },
    ]);
    const [after2D, after3D] = await snapshot();
    expect(after3D).toEqual(after2D);
    expect(after2D.watch_glass).toBe('on_balance');
    expect(after2D.four_beam_balance).toBe('bench');
    expect(after2D.funnel).toBe('shelf');
  });
});

describe('2D laboratory', () => {
  it('selects apparatus by pointer and keyboard through the shared pickItem path', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const events = store.getState().session!.events.length;
    const { user } = renderApp(store);

    await user.click(svgItem('watch_glass'));
    expect(store.getState().ui.pendingApparatus).toEqual(['watch_glass']);
    expect(svgItem('watch_glass')).toHaveAttribute('aria-pressed', 'true');
    // The accessible equipment list reflects the same UI state.
    expect(document.getElementById('equip-watch_glass')).toBeChecked();

    svgItem('funnel').focus();
    fireEvent.keyDown(svgItem('funnel'), { key: 'Enter' });
    fireEvent.keyDown(svgItem('funnel'), { key: ' ' });
    fireEvent.keyDown(svgItem('funnel'), { key: 'Enter' });
    expect(store.getState().ui.pendingApparatus).toEqual(['watch_glass', 'funnel']);
    // Selection is UI state only: nothing was dispatched.
    expect(store.getState().session!.events).toHaveLength(events);
  });

  it('every item is a labelled, focusable button with a stable target ID', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    renderApp(store);
    const ids = [...definition.apparatus.map((a) => a.id), 'reagent_na2co3'];
    for (const id of ids) {
      const el = svgItem(id);
      expect(el, id).not.toBeNull();
      expect(el).toHaveAttribute('role', 'button');
      expect(el).toHaveAttribute('tabindex', '0');
      expect(el.getAttribute('aria-label')).toMatch(/\S+, \S+/);
    }
  });

  it('shows the authoritative state after accepted actions', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await dispatchAll(store, [
      { type: 'confirm_safety', checklistItemIds: checklist },
      {
        type: 'select_apparatus',
        apparatusIds: ['watch_glass', 'four_beam_balance', 'funnel', 'volumetric_flask_250'],
      },
      { type: 'weigh_watch_glass' },
      { type: 'set_balance_sliders', mass: { value: 40, unit: 'g' } },
      { type: 'place_funnel' },
    ]);
    renderApp(store);
    expect(svgItem('watch_glass').getAttribute('data-placement')).toBe('on_balance');
    expect(svgItem('funnel').getAttribute('data-placement')).toBe('on_flask');
    expect(svgItem('volumetric_flask_250').getAttribute('data-placement')).toBe('bench');
    expect(document.querySelector('.lab2d-needle--active')).not.toBeNull();
    const description = screen.getByRole('region', { name: tx('ui.canvas.fallback_title') });
    expect(within(description).getByText(tx('ui.canvas.funnel_on'))).toBeInTheDocument();
    expect(
      within(description).getByText(tx('ui.lab.readout.watch_glass_reading'), { exact: false }),
    ).toBeInTheDocument();
  });

  it('a rejected action leaves the drawing unchanged', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    renderApp(store);
    const before = placements2D();
    // No apparatus on the bench yet: the engine rejects this action.
    await dispatchAll(store, [{ type: 'weigh_watch_glass' }]);
    expect(store.getState().session!.events.at(-1)?.accepted).toBe(false);
    expect(placements2D()).toEqual(before);
  });

  it('manual mode never shows the validity warning that guided mode discloses', async () => {
    const tap: Action[] = [
      { type: 'confirm_safety', checklistItemIds: checklist },
      { type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] },
      { type: 'add_water', volume: { value: 10, unit: 'cm3' }, source: 'tap' },
    ];
    const manual = makeStore();
    await startSession(manual, 'manual');
    await dispatchAll(manual, tap);
    const first = renderApp(manual);
    expect(document.querySelector('.lab2d-warning')).toBeNull();
    expect(document.body.textContent).not.toContain('TAP_WATER');
    first.unmount();

    const guided = makeStore();
    await startSession(guided, 'guided', 'advanced');
    await dispatchAll(guided, tap);
    renderApp(guided);
    expect(document.querySelector('.lab2d-warning')).not.toBeNull();
  });

  it('zoom and close-up controls change only the view box', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const events = store.getState().session!.events.length;
    const { user } = renderApp(store);
    const svg = () => document.querySelector('.lab2d__svg')!;
    const overview = svg().getAttribute('viewBox');
    await user.click(screen.getByRole('button', { name: tx('ui.lab.view.balance') }));
    expect(svg().getAttribute('viewBox')).not.toBe(overview);
    await user.click(screen.getByRole('button', { name: tx('ui.lab.view.overview') }));
    expect(svg().getAttribute('viewBox')).toBe(overview);
    const zoomIn = screen.getByRole('button', { name: tx('ui.lab.zoom_in') });
    for (let i = 0; i < 8; i += 1) if (!zoomIn.hasAttribute('disabled')) await user.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    expect(store.getState().session!.events).toHaveLength(events);
  });
});

describe('3D renderer selection', () => {
  it('a 3D pick highlights the item for both renderers', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setLabView('3d');
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: '3d-pick-funnel' }));
    expect(screen.getByTestId('renderer-3d').getAttribute('data-selected')).toBe('funnel');
    await user.click(screen.getByRole('button', { name: tx('ui.lab.renderer_2d') }));
    expect(svgItem('funnel')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Sinhala', () => {
  it('switches language and renderer while keeping the same session', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const before = store.getState().session;
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: 'සිංහල' }));
    const si = resources.si.translation;
    expect(screen.getByRole('button', { name: si['ui.lab.renderer_2d']! })).toBeInTheDocument();
    expect(svgItem('watch_glass').getAttribute('aria-label')).toContain(
      si['exp04.apparatus.watch_glass']!,
    );
    await user.click(screen.getByRole('button', { name: si['ui.lab.renderer_3d']! }));
    expect(screen.getByTestId('renderer-3d')).toBeInTheDocument();
    expect(store.getState().session).toBe(before);
  });
});
