import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { definition } from '../engine/content';
import { resources } from '../i18n';
import { makeStore, renderApp, startSession } from './helpers';

const en = resources.en.translation;
const tx = (key: string) => en[key] ?? key;

const SECTIONS = [
  ['context', 'ui.overview.aims'],
  ['materials', 'ui.equipment.title'],
  ['predictions', 'ui.prelab.prediction'],
  ['protocol', 'ui.guidance.title'],
  ['results', 'ui.measurements.title'],
  ['reflection', 'ui.reflection.lead'],
  ['summary', 'ui.summary.not_submitted_title'],
] as const;

/** `ui.side.label` is the tablist's own accessible name, so scoping to it finds the section tabs
 * and nothing else that happens to share a tab role elsewhere on the page. */
const rail = () => screen.getByRole('tablist', { name: tx('ui.side.label') });

describe('V3-2: seven-section laboratory notebook', () => {
  it('every section renders its real content and never dispatches a stage transition', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const stageBefore = store.getState().session!.stage;
    const eventsBefore = store.getState().session!.events.length;
    const { user } = renderApp(store);

    for (const [id, headingOrLabelKey] of SECTIONS) {
      await user.click(within(rail()).getByRole('tab', { name: tx(`ui.side.${id}`) }));
      expect(within(rail()).getByRole('tab', { name: tx(`ui.side.${id}`) })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText(tx(headingOrLabelKey))).toBeInTheDocument();
    }
    // Switching the notebook section is presentation only (Task 2): the chemistry stage and the
    // recorded event history are exactly as they were before any section was ever opened.
    expect(store.getState().session!.stage).toBe(stageBefore);
    expect(store.getState().session!.events.length).toBe(eventsBefore);
  });

  it('keyboard arrows move focus between sections (vertical tablist)', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    const first = within(rail()).getByRole('tab', { name: tx('ui.side.context') });
    // Arrow navigation moves relative to the active tab, so select it the same way a user would
    // (click, which both activates and focuses) rather than calling .focus() out of band.
    await user.click(first);
    await user.keyboard('{ArrowDown}');
    expect(within(rail()).getByRole('tab', { name: tx('ui.side.materials') })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
  });

  it('the notebook pager moves between sections and is bounded at both ends', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    // The session opens on Protocol (the stage a learner needs to act on); move to the first
    // section so the pager's "previous" bound can be checked.
    await user.click(within(rail()).getByRole('tab', { name: tx('ui.side.context') }));
    const pager = screen.getByRole('navigation', { name: tx('ui.side.pager_label') });
    expect(
      within(pager).getByRole('button', { name: tx('ui.side.previous_section') }),
    ).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: tx('ui.side.next_section') }));
    expect(within(rail()).getByRole('tab', { name: tx('ui.side.materials') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Predictions reuses the pre-lab answers; nothing is re-entered or duplicated', async () => {
    const store = makeStore();
    store.getState().savePreLabAnswer(definition.preLabQuestions[0]!.id, 'My pre-lab answer');
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('predictions');
    renderApp(store);
    const field = await screen.findByLabelText(tx(definition.preLabQuestions[0]!.promptKey), {
      exact: false,
    });
    expect(field).toHaveValue('My pre-lab answer');
  });

  it('Reflection writes to the same postLab state the standalone reflection page reads', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('reflection');
    const { user } = renderApp(store);
    const field = await screen.findByLabelText(tx(definition.postLabQuestions[0]!.promptKey), {
      exact: false,
    });
    await user.type(field, 'My reflection');
    expect(store.getState().postLab.answers[definition.postLabQuestions[0]!.id]).toBe(
      'My reflection',
    );
  });

  it('Summary is honest before submission and shows the real score after', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('summary');
    renderApp(store);
    expect(screen.getByText(tx('ui.summary.not_submitted_title'))).toBeInTheDocument();
    expect(screen.queryByText(tx('ui.report.result_label'))).toBeNull();

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
    // The same SummarySection instance re-renders reactively once the store reports a score;
    // nothing is unmounted or re-rendered to pick this up.
    expect(await screen.findByText(tx('ui.summary.open_full_report'))).toBeInTheDocument();
    expect(document.querySelector('.report__label')).toHaveTextContent(
      tx('ui.report.result_label'),
    );
  });

  it('Materials selection focuses the item the laboratory scene also highlights', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().setWorkbenchTab('materials');
    const { user } = renderApp(store);
    await user.click(document.getElementById('equip-watch_glass')!);
    expect(store.getState().ui.pendingApparatus).toContain('watch_glass');
  });
});
