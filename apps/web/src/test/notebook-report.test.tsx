import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineError } from '../engine/adapter';
import { resources } from '../i18n';
import { makeLocalAdapter, makeStore, renderApp, startSession } from './helpers';

const en = resources.en.translation;
const si = resources.si.translation;
const tx = (k: string) => en[k] ?? k;

describe('notebook view', () => {
  it('prefills source-backed metadata, keeps student text across a language switch, and saves', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().navigate('notebook');
    const { user } = renderApp(store);
    const aim = await screen.findByLabelText(tx('ui.notebook.field.aim'));
    expect((aim as HTMLTextAreaElement).value).toContain(
      tx('exp04.objective.aim_glassware_balance'),
    );
    const observations = screen.getByLabelText(tx('ui.notebook.field.observations'));
    await user.type(observations, 'Clear solution; වර්ණයක් නැත');
    expect(screen.getByText(tx('ui.notebook.status.unsaved'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'සිංහල' }));
    const siObservations = screen.getByLabelText(si['ui.notebook.field.observations']!);
    expect(siObservations).toHaveValue('Clear solution; වර්ණයක් නැත');
    expect(
      (screen.getByLabelText(si['ui.notebook.field.aim']!) as HTMLTextAreaElement).value,
    ).toContain(tx('exp04.objective.aim_glassware_balance'));

    await user.click(screen.getByRole('button', { name: si['ui.notebook.save']! }));
    await waitFor(() => expect(store.getState().notebook.status).toBe('saved'));
    expect(screen.getByText(si['ui.notebook.status.saved']!)).toBeInTheDocument();
  });

  it('structured measurement rows store numbers with units', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().navigate('notebook');
    const { user } = renderApp(store);
    await user.click(
      await screen.findByRole('button', { name: tx('ui.notebook.measurement.add') }),
    );
    await user.type(
      screen.getByLabelText(`${tx('ui.notebook.measurement.label')} 1`),
      'Watch glass',
    );
    await user.type(screen.getByLabelText(`${tx('ui.notebook.measurement.value')} 1`), '31.42');
    await user.selectOptions(screen.getByLabelText(`${tx('ui.notebook.measurement.unit')} 1`), 'g');
    expect(store.getState().notebook.draft?.measurements[0]).toEqual({
      label: 'Watch glass',
      trial: null,
      value: 31.42,
      unit: 'g',
      note: '',
    });
  });

  it('shows a conflict instead of overwriting a newer save', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    const session = await startSession(store, 'manual');
    store.getState().navigate('notebook');
    const { user } = renderApp(store);
    await screen.findByLabelText(tx('ui.notebook.field.aim'));
    await adapter.saveNotebook(session.sessionId, {
      expectedVersion: 0,
      document: store.getState().notebook.draft!,
    });
    await user.click(screen.getByRole('button', { name: tx('ui.notebook.save') }));
    expect(await screen.findByText(tx('ui.notebook.status.conflict'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tx('ui.notebook.overwrite') })).toBeInTheDocument();
  });
});

describe('report view', () => {
  it('is unavailable before submission', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    renderApp(store);
    expect(screen.getByRole('button', { name: tx('ui.nav.report') })).toBeDisabled();
    store.getState().navigate('report');
    expect(await screen.findByText(tx('ui.report.status.unavailable'))).toBeInTheDocument();
  });

  it('reveals manual-mode mistakes and calculated results only in the completed report', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const actions = [
      { type: 'select_apparatus' as const, apparatusIds: ['volumetric_flask_250'] },
      {
        type: 'add_water' as const,
        volume: { value: 250, unit: 'cm3' as const },
        source: 'tap' as const,
      },
    ];
    for (const a of actions) await store.getState().dispatchLabAction(a);
    const { user } = renderApp(store);
    const tapMessage = tx('exp04.error.tap_water_used.message');
    expect(screen.queryByText(tapMessage)).toBeNull();

    await user.click(
      within(document.getElementById('action-form-submit_experiment')!).getByRole('button', {
        name: tx('exp04.action.submit_experiment'),
      }),
    );
    await waitFor(() => expect(store.getState().session?.status).toBe('submitted'));
    expect(screen.queryByText(tapMessage)).toBeNull(); // still hidden on the workbench
    await user.click(screen.getByRole('button', { name: tx('ui.nav.report') }));

    expect(
      await screen.findByRole('heading', { level: 1, name: tx('ui.report.title') }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(tapMessage).length).toBeGreaterThan(0);
    expect(document.querySelector('.report__label')).toHaveTextContent(
      tx('ui.report.result_label'),
    );
    for (const c of ['safety', 'technique', 'measurement', 'completeness', 'independence'])
      expect(
        screen.getByRole('heading', { level: 3, name: new RegExp(tx(`ui.report.category.${c}`)) }),
      ).toBeInTheDocument();
    expect(screen.getAllByText(tx('ui.report.evidence')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(tx('ui.report.assumption_label')).length).toBeGreaterThan(0);
    expect(screen.getByText(tx('exp04.measurement.achieved_concentration'))).toBeInTheDocument();
  });
});

describe('connectivity banner', () => {
  it('shows a retryable error with a retry button and keeps the session', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    vi.spyOn(adapter, 'submitAction').mockRejectedValueOnce(
      new EngineError('network_unavailable', null, true),
    );
    const { user } = renderApp(store);
    await user.click(
      within(document.getElementById('action-form-request_hint')!).getByRole('button', {
        name: tx('exp04.action.request_hint'),
      }),
    );
    const banner = await screen.findByText(tx('ui.connection.network_unavailable'));
    expect(banner).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('ui.connection.retry') }));
    await waitFor(() => expect(store.getState().connection).toBeNull());
    expect(store.getState().session?.events.at(-1)?.actionType).toBe('request_hint');
  });

  it('disables action buttons while a request is pending', async () => {
    const adapter = makeLocalAdapter();
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = adapter.submitAction.bind(adapter);
    vi.spyOn(adapter, 'submitAction').mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const { user } = renderApp(store);
    const button = within(document.getElementById('action-form-request_hint')!).getByRole(
      'button',
      { name: tx('exp04.action.request_hint') },
    );
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    release();
    await waitFor(() => expect(button).toBeEnabled());
  });
});

describe('zero-solute submission', () => {
  it('the report shows c = 0 mol dm⁻³ and the completion deduction', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['volumetric_flask_250'] },
      {
        type: 'add_water' as const,
        volume: { value: 250, unit: 'cm3' as const },
        source: 'distilled' as const,
      },
      { type: 'submit_experiment' as const },
    ])
      await store.getState().dispatchLabAction(a);
    store.getState().navigate('report');
    renderApp(store);
    expect(
      await screen.findByRole('heading', { level: 1, name: tx('ui.report.title') }),
    ).toBeInTheDocument();
    const row = screen.getByText(tx('exp04.measurement.achieved_concentration')).closest('tr')!;
    expect(row).toHaveTextContent('0 mol dm⁻³');
    expect(
      screen.getAllByText(tx('exp04.error.incomplete_procedure.message')).length,
    ).toBeGreaterThan(0);
    const completeness = screen.getByRole('heading', {
      level: 3,
      name: new RegExp(tx('ui.report.category.completeness')),
    });
    expect(completeness.textContent).not.toContain('100 / 100');
  });
});
