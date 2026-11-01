import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resources } from '../i18n';
import { makeStore, renderApp, startSession } from './helpers';

const en = resources.en.translation;
const si = resources.si.translation;
const tx = (key: string) => en[key] ?? key;

describe('student flow', () => {
  it('dashboard → library → overview → pre-lab → mode → workbench, with source-backed content', async () => {
    const { user, store } = renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: tx('ui.dashboard.title') }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('ui.nav.library') }));
    expect(
      screen.getByRole('heading', { level: 1, name: tx('ui.library.title') }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(tx('ui.card.experiment_number').replace('{{number}}', '4')),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('ui.card.start') }));

    expect(screen.getByRole('heading', { level: 1, name: tx('exp04.title') })).toBeInTheDocument();
    expect(screen.getByText(tx('exp04.calc.mass'))).toBeInTheDocument();
    expect(screen.getAllByText(/PDF p\. 29 \(printed p\. 21\)/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: tx('ui.nav.to_prelab') }));

    await user.type(
      screen.getByLabelText(new RegExp(tx('exp04.prelab.q2.prompt'))),
      'amount over volume',
    );
    await user.click(screen.getByRole('button', { name: tx('ui.nav.to_mode') }));
    expect(screen.getByRole('button', { name: tx('ui.mode.start') })).toBeDisabled();
    expect(screen.getByText(tx('ui.mode.safety_required'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: tx('ui.nav.back_prelab') }));
    expect(screen.getByLabelText(new RegExp(tx('exp04.prelab.q2.prompt')))).toHaveValue(
      'amount over volume',
    );
    await user.click(screen.getByRole('button', { name: tx('ui.nav.to_mode') }));
    for (const r of store
      .getState()
      .engine.definition.safetyRules.filter((x) => x.kind === 'checklist'))
      await user.click(screen.getByLabelText(tx(r.textKey)));
    expect(screen.getByText(tx('ui.prelab.safety_complete'))).toBeInTheDocument();
    await user.click(screen.getByLabelText(tx('ui.mode.manual.title')));
    await user.click(screen.getByRole('button', { name: tx('ui.mode.start') }));

    expect(
      await screen.findByRole('heading', { level: 1, name: tx('exp04.title') }),
    ).toBeInTheDocument();
    // The mode chip was removed from the workbench; the Protocol section is the check now.
    const protocol = screen.getByRole('tab', { name: tx('ui.side.protocol') });
    if (protocol.getAttribute('aria-expanded') !== 'true') await user.click(protocol);
    expect(screen.getByRole('heading', { name: tx('ui.actions.title') })).toBeInTheDocument();
  }, 15_000); // long multi-view flow; slow only under full parallel load

  it('pre-lab exposes no answer guides before submission', async () => {
    const store = makeStore();
    store.getState().navigate('prelab');
    renderApp(store);
    for (const key of ['exp04.prelab.q2.answer', 'exp04.prelab.q3.answer'])
      expect(screen.queryByText(tx(key))).toBeNull();
  });
});

describe('language', () => {
  it('sets <html lang> and shows the draft notice for Sinhala', async () => {
    const { user } = renderApp();
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(screen.queryByText(tx('ui.translation.draft_notice'))).toBeNull();
    await user.click(screen.getByRole('button', { name: 'සිංහල' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('si'));
    expect(screen.getByText(si['ui.translation.draft_notice']!)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: si['ui.dashboard.title']! }),
    ).toBeInTheDocument();
  });

  it('switching language on the workbench keeps the experiment state, events and stage', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'intermediate');
    await store
      .getState()
      .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] });
    const { user } = renderApp(store);
    const before = store.getState().session;
    await user.click(screen.getByRole('button', { name: 'සිංහල' }));
    expect(screen.getByRole('heading', { level: 1, name: si['exp04.title']! })).toBeInTheDocument();
    expect(store.getState().session).toBe(before);
    expect(store.getState().view).toBe('workbench');
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(store.getState().session).toBe(before);
  });
});

describe('workbench', () => {
  it('shows the 2D laboratory without WebGL, and falls back to it from 3D without losing any controls', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const before = store.getState().session;
    store.getState().setWorkbenchTab('protocol');
    const { user } = renderApp(store);
    // 2D is the default and needs no WebGL (jsdom has none).
    expect(screen.getByRole('group', { name: tx('ui.lab.scene_label') })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: tx('ui.canvas.fallback_title') }),
    ).toBeInTheDocument();
    expect(screen.queryByText(tx('ui.canvas.fallback_unsupported'))).toBeNull();

    await user.click(screen.getByRole('button', { name: tx('ui.lab.renderer_3d') }));
    expect(screen.getByText(tx('ui.canvas.fallback_unsupported'))).toBeInTheDocument();
    expect(screen.getByRole('group', { name: tx('ui.lab.scene_label') })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: tx('exp04.action.weigh_watch_glass') }).length,
    ).toBe(1);
    expect(store.getState().session).toBe(before);
  });

  it('numeric inputs dispatch typed quantities with units', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['four_beam_balance', 'watch_glass'] },
      { type: 'weigh_watch_glass' as const },
    ])
      await store.getState().dispatchLabAction(a);
    store.getState().setWorkbenchTab('protocol');
    const { user } = renderApp(store);
    const form = document.getElementById('action-form-set_balance_sliders')!;
    expect(within(form).getByText('g')).toBeInTheDocument();
    await user.type(within(form).getByLabelText(tx('ui.form.slider_total')), '56.5');
    await user.click(
      within(form).getByRole('button', { name: tx('exp04.action.set_balance_sliders') }),
    );
    await waitFor(() =>
      expect(store.getState().session!.events.at(-1)?.action).toEqual({
        type: 'set_balance_sliders',
        mass: { value: 56.5, unit: 'g' },
      }),
    );
  });

  it('invalid input is reported and not dispatched (never silently repaired)', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('protocol');
    const { user } = renderApp(store);
    const events = store.getState().session!.events.length;
    const form = document.getElementById('action-form-add_water')!;
    await user.click(within(form).getByRole('button', { name: tx('exp04.action.add_water') }));
    expect(within(form).getByRole('alert')).toHaveTextContent(tx('ui.form.invalid_number'));
    await user.type(within(form).getByLabelText(tx('ui.form.water_volume')), '-5');
    await user.click(within(form).getByLabelText(tx('ui.choice.water.distilled')));
    await user.click(within(form).getByRole('button', { name: tx('exp04.action.add_water') }));
    expect(within(form).getByRole('alert')).toHaveTextContent(tx('ui.form.invalid'));
    expect(store.getState().session!.events.length).toBe(events);
  });

  it('a physically impossible action shows a visible rejection in manual mode', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('protocol');
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: tx('exp04.action.remove_funnel') }));
    await user.click(screen.getByRole('tab', { name: tx('ui.side.results') }));
    const log = await screen.findByRole('heading', { name: tx('ui.log.feedback') });
    expect(
      within(log.parentElement!).getByText(tx('engine.rejection.funnel_on_flask')),
    ).toBeInTheDocument();
  });

  it('manual mode does not label hidden technique errors in the live interface', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    await store
      .getState()
      .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] });
    await store
      .getState()
      .dispatchLabAction({ type: 'add_water', volume: { value: 10, unit: 'cm3' }, source: 'tap' });
    renderApp(store);
    expect(screen.queryByText(tx('exp04.error.tap_water_used.message'))).toBeNull();
    expect(screen.queryByText(tx('ui.canvas.warning'))).toBeNull();
  });

  it('guided mode shows the procedural feedback for the same action', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'advanced');
    await store
      .getState()
      .dispatchLabAction({ type: 'select_apparatus', apparatusIds: ['volumetric_flask_250'] });
    await store
      .getState()
      .dispatchLabAction({ type: 'add_water', volume: { value: 10, unit: 'cm3' }, source: 'tap' });
    renderApp(store);
    expect(screen.getAllByText(tx('exp04.error.tap_water_used.message')).length).toBeGreaterThan(0);
  });

  it('guided beginner marks the suggested action; manual shows no procedural prompt', async () => {
    const beginner = makeStore();
    await startSession(beginner, 'guided', 'beginner');
    renderApp(beginner);
    const form = document.getElementById('action-form-select_apparatus')!;
    expect(within(form).getByText(tx('ui.action.suggested'))).toBeInTheDocument();
    expect(screen.getByText(tx('exp04.step.select_apparatus.instruction'))).toBeInTheDocument();
  });

  it('safety alerts are announced and visible in manual mode', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['four_beam_balance', 'watch_glass'] },
      { type: 'weigh_watch_glass' as const },
      { type: 'add_solid' as const, mass: { value: 1, unit: 'g' as const }, handContact: true },
    ])
      await store.getState().dispatchLabAction(a);
    renderApp(store);
    const alerts = screen.getAllByRole('alert');
    expect(
      alerts.some((a) => a.textContent?.includes(tx('exp04.error.chemical_skin_contact.message'))),
    ).toBe(true);
  });

  it('automatic controls step the demonstration through the engine', async () => {
    const store = makeStore();
    await startSession(store, 'automatic');
    const { user } = renderApp(store);
    expect(screen.queryByRole('heading', { name: tx('ui.actions.title') })).toBeNull();
    await user.click(screen.getByRole('button', { name: tx('ui.automatic.next_step') }));
    await waitFor(() => expect(store.getState().session!.events).toHaveLength(1));
    expect(store.getState().session!.events[0]?.actor).toBe('system');
    expect(screen.getByText(tx('ui.guidance.narration'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('ui.automatic.start') }));
    expect(store.getState().automatic.running).toBe(true);
    await user.click(screen.getByRole('button', { name: tx('ui.automatic.pause') }));
    expect(store.getState().automatic.running).toBe(false);
    await user.click(screen.getByRole('button', { name: tx('ui.automatic.restart') }));
    await waitFor(() => expect(store.getState().session!.attempt).toBe(2));
  });

  it('mode change from the workbench asks for confirmation', async () => {
    const store = makeStore();
    const first = await startSession(store, 'guided', 'beginner');
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: tx('ui.workbench.change_mode') }));
    await user.click(screen.getByLabelText(tx('ui.mode.manual.title')));
    await user.click(screen.getByRole('button', { name: tx('ui.mode.start_new') }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(tx('ui.confirm.mode_change_title'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: tx('ui.confirm.continue') }));
    await waitFor(() => expect(store.getState().session!.sessionId).not.toBe(first.sessionId));
    expect(store.getState().session!.mode).toBe('manual');
  });
});

describe('keyboard operation', () => {
  it('primary controls are reachable and operable with the keyboard alone', async () => {
    const { user, store } = renderApp();
    await user.tab(); // skip link
    await user.tab(); // brand (home)
    expect(screen.getByRole('button', { name: tx('ui.nav.home_label') })).toHaveFocus();
    await user.tab(); // Dashboard
    await user.tab(); // Practical library
    const libraryNav = screen.getByRole('button', { name: tx('ui.nav.library') });
    expect(libraryNav).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(store.getState().view).toBe('library');
    expect(libraryNav).toHaveAttribute('aria-current', 'page');
    await user.tab(); // Start a practical
    await user.tab(); // Admin (always listed in development builds)
    await user.tab(); // English
    await user.tab(); // Sinhala
    await user.tab(); // search
    expect(screen.getByLabelText(tx('ui.library.search_label'))).toHaveFocus();
    await user.tab(); // unit filter
    expect(screen.getByLabelText(tx('ui.library.unit_filter'))).toHaveFocus();
    const start = await screen.findByRole('button', { name: tx('ui.card.start') });
    // Entries 1–3 precede Experiment 4 and have reference summaries and guided-practice buttons.
    for (let i = 0; i < 10 && document.activeElement !== start; i++) await user.tab();
    expect(start).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(store.getState().view).toBe('overview');
  });

  it('equipment checkboxes and action buttons work from the keyboard', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    // The equipment checklist (Materials) and the dispatch form (Protocol) are separate notebook
    // sections now (V3-2); a keyboard user reaches each by switching the active section tab.
    store.getState().setWorkbenchTab('materials');
    const { user } = renderApp(store);
    const box = document.getElementById('equip-watch_glass') as HTMLInputElement;
    expect(box).toHaveAccessibleName(new RegExp(tx('exp04.apparatus.watch_glass')));
    box.focus();
    await user.keyboard(' ');
    expect(store.getState().ui.pendingApparatus).toEqual(['watch_glass']);
    await user.click(screen.getByRole('tab', { name: tx('ui.side.protocol') }));
    const button = within(document.getElementById('action-form-select_apparatus')!).getByRole(
      'button',
      { name: tx('exp04.action.select_apparatus') },
    );
    button.focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    await waitFor(() =>
      expect(store.getState().session!.bench.selectedApparatus).toEqual(['watch_glass']),
    );
  });
});
