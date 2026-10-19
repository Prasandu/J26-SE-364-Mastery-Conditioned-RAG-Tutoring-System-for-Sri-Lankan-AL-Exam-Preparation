import { ExperimentSummarySchema, type ExperimentSummary } from '@vlab/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineError, type EngineAdapter } from '../engine/adapter';
import { createApiEngineAdapter } from '../engine/apiAdapter';
import { resources } from '../i18n';
import { makeLocalAdapter, makeStore, renderApp, startSession } from './helpers';

const en = resources.en.translation;
const si = resources.si.translation;
const tx = (key: string) => en[key] ?? key;

/** What `GET /experiments` returns for Experiment 4 (validated against the contract below). */
const summary: ExperimentSummary = ExperimentSummarySchema.parse({
  experimentId: 'exp04_standard_solution',
  experimentNumber: 4,
  titleKey: 'exp04.title',
  definitionVersion: '1.1.0',
  assessmentVersion: '1.0.0',
  active: true,
  modes: ['automatic', 'guided', 'manual'],
  locales: ['en', 'si'],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Local engine whose catalog behaves like a remote catalog (loading, failures, retries). */
const withCatalog = (
  list: () => Promise<Awaited<ReturnType<EngineAdapter['listExperiments']>>>,
) => {
  const local = makeLocalAdapter();
  return { ...local, listExperiments: list } satisfies EngineAdapter;
};

describe('dashboard', () => {
  it('shows only real data: catalog count, and no invented progress or duration', async () => {
    renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: tx('ui.dashboard.title') }),
    ).toBeInTheDocument();
    const facts = screen.getByRole('list', { name: tx('ui.dashboard.facts') });
    await waitFor(() =>
      expect(
        within(facts).getByText(tx('ui.dashboard.practicals_available')).nextSibling,
      ).toHaveTextContent('1'),
    );
    // No continue card without a real session; no fabricated statistics.
    expect(screen.queryByText(tx('ui.dashboard.continue_title'))).toBeNull();
    expect(document.body.textContent).not.toMatch(/minutes|progress:|%/i);
  });

  it('offers to continue the current session with its real mode and stage', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'advanced');
    store.getState().navigate('dashboard');
    const { user } = renderApp(store);
    const card = screen.getByRole('region', {
      name: new RegExp(tx('ui.dashboard.continue_title')),
    });
    expect(within(card).getByText(new RegExp(tx('ui.level.advanced.title')))).toBeInTheDocument();
    expect(within(card).getByText(tx('ui.dashboard.status_active'))).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: tx('ui.dashboard.view_report') })).toBeNull();
    await user.click(
      within(card).getByRole('button', { name: tx('ui.dashboard.continue_action') }),
    );
    expect(store.getState().view).toBe('workbench');
  });

  it('the floating "Need help?" button only appears once a session exists', async () => {
    const local = makeLocalAdapter();
    const online: EngineAdapter = { ...local, kind: 'api' };
    const empty = makeStore(42, online);
    renderApp(empty);
    expect(screen.queryByRole('button', { name: tx('assistant.help_button') })).toBeNull();
  });

  it('header navigation marks the current page', async () => {
    const { user } = renderApp();
    const dashboard = screen.getByRole('button', { name: tx('ui.nav.dashboard') });
    expect(dashboard).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: tx('ui.nav.library') }));
    expect(screen.getByRole('button', { name: tx('ui.nav.library') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(dashboard).not.toHaveAttribute('aria-current');
  });

  it('renders in Sinhala with the Sinhala title', async () => {
    const store = makeStore();
    store.getState().setLocale('si');
    renderApp(store);
    expect(
      await screen.findByRole('heading', { level: 1, name: si['ui.dashboard.title']! }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('si'));
  });
});

describe('practical library', () => {
  it('searches by title or number, filters by unit and recovers from no matches', async () => {
    const store = makeStore();
    store.getState().navigate('library');
    const { user } = renderApp(store);
    expect(await screen.findByText(tx('ui.card.runnable'))).toBeInTheDocument();
    const search = screen.getByLabelText(tx('ui.library.search_label'));
    await user.type(search, 'titration of oxalic acid');
    expect(screen.getByText(tx('ui.library.no_match_title'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: tx('ui.card.start') })).toBeNull();
    await user.click(screen.getByRole('button', { name: tx('ui.library.clear_filters') }));
    expect(search).toHaveValue('');
    await user.type(search, '4');
    expect(screen.getByRole('button', { name: tx('ui.card.start') })).toBeInTheDocument();
    const unit = screen.getByLabelText(tx('ui.library.unit_filter'));
    expect(within(unit).getByRole('option', { name: tx('exp04.unit.title') })).toBeInTheDocument();
    await user.selectOptions(unit, '3');
    expect(screen.getByRole('button', { name: tx('ui.card.start') })).toBeInTheDocument();
  });

  it('cards show unit, modes and languages with the draft Sinhala marker, and no duration', async () => {
    const store = makeStore();
    store.getState().navigate('library');
    renderApp(store);
    const card = await screen.findByRole('article', { name: tx('exp04.title') });
    expect(within(card).getByText(tx('exp04.unit.title'))).toBeInTheDocument();
    for (const m of ['automatic', 'guided', 'manual'])
      expect(within(card).getByText(tx(`ui.mode.${m}.title`))).toBeInTheDocument();
    expect(within(card).getByText(new RegExp(tx('ui.card.draft')))).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/minute|duration/i);
  });

  it('shows loading, then an error with retry, then the catalog', async () => {
    let fail = true;
    let release: () => void = () => undefined;
    const list = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<EngineAdapter['listExperiments']>>>((resolve, reject) => {
          release = () =>
            fail
              ? reject(new EngineError('network_unavailable', null, true))
              : resolve(makeLocalAdapter().listExperiments());
        }),
    );
    const store = makeStore(42, withCatalog(list));
    store.getState().navigate('library');
    const { user } = renderApp(store);
    expect(await screen.findByText(tx('ui.library.loading'))).toBeInTheDocument();
    release();
    expect(await screen.findByText(tx('ui.library.error_title'))).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: tx('ui.connection.retry') }));
    release();
    expect(await screen.findByRole('button', { name: tx('ui.card.start') })).toBeInTheDocument();
  });

  it('shows an empty state when nothing is published', async () => {
    const store = makeStore(
      42,
      withCatalog(async () => []),
    );
    store.getState().navigate('library');
    renderApp(store);
    expect(await screen.findByText(tx('ui.library.empty_title'))).toBeInTheDocument();
  });
});

describe('API catalog', () => {
  it('lists only active practicals this client can run, and rejects invalid payloads', async () => {
    const other = { ...summary, experimentId: 'exp36_unsupported', experimentNumber: 36 };
    const inactive = { ...summary, active: false };
    const fetchMock = vi.fn(async () => json(200, [summary, other, inactive]));
    const adapter = createApiEngineAdapter({ baseUrl: 'http://x', fetch: fetchMock });
    const items = await adapter.listExperiments();
    expect(items.map((i) => i.experimentId)).toEqual([summary.experimentId]);
    expect(items[0]!.unitTitleKey).toBe('exp04.unit.title');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://x/experiments');
    const garbage = createApiEngineAdapter({
      baseUrl: 'http://x',
      fetch: async () => json(200, [{ experimentId: 'x' }]),
    });
    await expect(garbage.listExperiments()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('practical flow pages', () => {
  it('overview marks the current step and keeps a single primary action', async () => {
    const store = makeStore();
    store.getState().navigate('overview');
    renderApp(store);
    const steps = screen.getByRole('navigation', { name: tx('ui.flow.label') });
    expect(within(steps).getByText(tx('ui.flow.overview')).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getAllByRole('button', { name: tx('ui.nav.to_prelab') })).toHaveLength(1);
  });

  it('pre-lab readiness reflects the real checklist and the answer limit', async () => {
    const store = makeStore();
    store.getState().navigate('prelab');
    const { user } = renderApp(store);
    const readiness = screen.getByRole('complementary', { name: tx('ui.prelab.readiness') });
    const checklist = store
      .getState()
      .engine.definition.safetyRules.filter((r) => r.kind === 'checklist');
    expect(within(readiness).getByText(`0 / ${checklist.length}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('ui.nav.to_mode') }));
    await user.click(screen.getByLabelText(tx('ui.mode.guided.title')));
    for (const r of checklist) await user.click(screen.getByLabelText(tx(r.textKey)));
    await user.click(screen.getByRole('button', { name: tx('ui.nav.back_prelab') }));
    expect(
      within(screen.getByRole('complementary', { name: tx('ui.prelab.readiness') })).getByText(
        `${checklist.length} / ${checklist.length}`,
      ),
    ).toBeInTheDocument();
    const firstAnswer = screen.getAllByRole('textbox')[0]!;
    expect(firstAnswer).toHaveAttribute('maxLength', '2000');
    await user.type(firstAnswer, 'abc');
    expect(screen.getByText('3 / 2000 characters')).toBeInTheDocument();
  });

  it('mode cards explain the support each mode gives', async () => {
    const store = makeStore();
    store.getState().navigate('mode');
    const { user } = renderApp(store);
    for (const m of ['automatic', 'guided', 'manual']) {
      expect(screen.getByText(tx(`ui.mode.${m}.support`))).toBeInTheDocument();
      expect(screen.getByLabelText(tx(`ui.mode.${m}.title`))).toHaveAccessibleDescription(
        `${tx(`ui.mode.${m}.description`)} ${tx('ui.mode.support_label')} ${tx(`ui.mode.${m}.support`)}`,
      );
    }
    await user.click(screen.getByLabelText(tx('ui.mode.manual.title')));
    expect(screen.getByLabelText(tx('ui.mode.manual.title')).closest('.mode-option')).toHaveClass(
      'mode-option--selected',
    );
  });
});

describe('workbench and report', () => {
  it('workbench shows the session facts and every panel through the side-panel tabs', async () => {
    const store = makeStore();
    await startSession(store, 'guided', 'beginner');
    const { user } = renderApp(store);
    const facts = screen.getByRole('list', { name: tx('ui.workbench.session_facts') });
    expect(within(facts).getByText(tx('ui.mode.guided.title'))).toBeInTheDocument();
    expect(within(facts).getByText(tx('ui.level.beginner.title'))).toBeInTheDocument();
    // The equipment tray is the notebook's Materials section now (V3-2).
    await user.click(screen.getByRole('tab', { name: tx('ui.side.materials') }));
    expect(screen.getByRole('heading', { name: tx('ui.equipment.title') })).toBeInTheDocument();
    // Protocol now also hosts guidance and the full action list (one notebook section).
    await user.click(screen.getByRole('tab', { name: tx('ui.side.protocol') }));
    expect(screen.getByRole('tab', { name: tx('ui.side.protocol') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: tx('ui.guidance.title') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: tx('ui.actions.title') })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: tx('ui.side.results') }));
    expect(screen.getByRole('tab', { name: tx('ui.side.results') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: tx('ui.log.title') })).toBeInTheDocument();
    expect(screen.getByText(tx('ui.stage.caption'))).toBeInTheDocument();
    // The assistant is a floating "Need help?" widget, reachable from every flow step.
    await user.click(screen.getByRole('button', { name: tx('assistant.help_button') }));
    expect(screen.getByRole('heading', { name: tx('assistant.title') })).toBeInTheDocument();
  });

  it('report lists recorded actions with observations, and the summary keeps deterministic scores', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    for (const a of [
      { type: 'select_apparatus' as const, apparatusIds: ['volumetric_flask_250'] },
      {
        type: 'add_water' as const,
        volume: { value: 250, unit: 'cm3' as const },
        source: 'tap' as const,
      },
      { type: 'submit_experiment' as const },
    ])
      await store.getState().dispatchLabAction(a);
    await waitFor(() => expect(store.getState().session?.status).toBe('submitted'));
    store.getState().navigate('report');
    renderApp(store);
    const actions = await screen.findByRole('region', {
      name: new RegExp(tx('ui.report.actions')),
    });
    const rows = within(actions).getAllByRole('row');
    expect(rows.length - 1).toBe(store.getState().session!.events.length);
    expect(within(actions).getByText(tx('exp04.action.submit_experiment'))).toBeInTheDocument();
    const summaryRegion = screen.getByRole('region', { name: tx('ui.report.summary') });
    const report = store.getState().report.data!;
    for (const c of report.categories)
      expect(
        within(summaryRegion).getByText(tx(`ui.report.category.${c.category}`)),
      ).toBeInTheDocument();
    expect(within(summaryRegion).getByText(`${report.overall} / 100`)).toBeInTheDocument();
  });
});
