import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import type { TeachingDefinition, TeachingRecord } from '@vlab/contracts';
import { teachingPractice } from '../engine/localAdapter';
import { resources, createI18n } from '../i18n';
import { makeStore, renderApp } from './helpers';
import { StoreProvider } from '../store/StoreProvider';
import { SimulationAuthor } from '../admin/SimulationAuthor';
import type { AdminClient } from '../admin/adminClient';

afterEach(cleanup);
const en = resources.en.translation;
const tx = (key: string) => en[key]!;
const runStep = async (
  user: ReturnType<typeof userEvent.setup>,
  d: TeachingDefinition,
  index: number,
) => {
  const step = d.tests[0]!.steps[index]!;
  const tool = d.apparatus.find((a) => a.id === step.apparatusId)!;
  const n = d.apparatus.indexOf(tool) + 1;
  await user.click(screen.getByRole('button', { name: `${n}. ${tool.label.en}` }));
  await user.click(screen.getByRole('button', { name: tx('teaching.perform_step') }));
};

describe('teaching workspaces', () => {
  it.each(teachingPractice.bundled)(
    '$id opens its own bilingual guide and apparatus controls',
    async (d) => {
      const store = makeStore();
      const original = store.getState().engine;
      store.getState().openTeaching(d);
      const { user } = renderApp(store);
      await screen.findByRole('heading', { level: 1, name: d.title.en });
      expect(screen.getByText(d.limitations.en)).toBeVisible();
      await user.click(screen.getByRole('button', { name: tx('teaching.enter_lab') }));
      expect(screen.getByRole('img', { name: tx('teaching.scene2d') })).toBeVisible();
      expect(screen.getByRole('button', { name: tx('teaching.perform_step') })).toBeDisabled();
      act(() => store.getState().setLocale('si'));
      expect(screen.getByRole('heading', { level: 1, name: d.title.si })).toBeVisible();
      expect(store.getState().engine).toBe(original);
      expect(store.getState().teaching.runs[`${d.id}@${d.revision}`]!.sequence).toBe(0);
    },
  );
  it('requires correct apparatus and cold-bath readings, then records exact notes', async () => {
    const d = teachingPractice.bundled.find((d) => d.experimentNumber === 29)!;
    const store = makeStore();
    store.getState().openTeaching(d);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { level: 1, name: d.title.en });
    await user.click(screen.getByRole('button', { name: tx('teaching.enter_lab') }));
    await user.click(screen.getByRole('checkbox'));
    const temperature = screen.getByRole('spinbutton');
    await user.type(temperature, '12');
    await runStep(user, d, 0);
    expect(screen.getByRole('alert')).toHaveTextContent(tx('teaching.error.temperature'));
    await user.clear(temperature);
    await user.type(temperature, '2');
    for (let i = 0; i < d.tests[0]!.steps.length; i++) await runStep(user, d, i);
    await user.click(screen.getByRole('button', { name: tx('labs.record') }));
    await user.click(screen.getByRole('button', { name: tx('teaching.tab.notebook') }));
    await user.type(screen.getByLabelText(tx('labs.notes')), 'Exact text. සිංහල');
    await user.click(screen.getByRole('button', { name: tx('teaching.tab.report') }));
    expect(screen.getByText(d.outcomes[0]!.observation.en)).toBeVisible();
    expect(screen.getByText('Exact text. සිංහල')).toBeVisible();
  });
  it('starts all kinetics fields blank and calculates only from entered times', async () => {
    const d = teachingPractice.bundled.find((d) => d.experimentNumber === 30)!;
    const store = makeStore();
    store.getState().openTeaching(d);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { level: 1, name: d.title.en });
    await user.click(screen.getByRole('button', { name: tx('teaching.enter_lab') }));
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(5);
    for (const input of inputs) expect(input).toHaveValue(null);
    await user.click(screen.getByRole('checkbox'));
    await runStep(user, d, 0);
    await runStep(user, d, 1);
    await runStep(user, d, 2);
    expect(screen.getByRole('alert')).toHaveTextContent(tx('teaching.error.measurements'));
    for (const [i, c] of d.concentrationsMolDm3.entries())
      await user.type(inputs[i]!, String(100 / c));
    await runStep(user, d, 2);
    await runStep(user, d, 3);
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByText(/Estimated concentration order: 1.0000/)).toBeVisible();
    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, '200');
    await user.click(screen.getByRole('button', { name: tx('labs.record') }));
    const saved = store.getState().teaching.runs[`${d.id}@${d.revision}`]!.trials[0]!;
    expect(saved.measurements['1']).toBe(200);
    expect(inputs[0]).toBeDisabled();
  });
});

describe('no-code authoring form', () => {
  it('saves staged, separately activates, and removes availability when edited', async () => {
    const records: TeachingRecord[] = [];
    const client = {
      simulationModels: vi.fn(async () => records),
      saveSimulationModel: vi.fn(
        async (id: string | null, version: number | null, definition: TeachingDefinition) => {
          const record: TeachingRecord = {
            id: id ?? 'a'.repeat(32),
            version: (version ?? 0) + 1,
            createdAt: '2026-10-21T12:00:00Z',
            updatedAt: '2026-10-21T12:00:00Z',
            definition,
            status: 'staged',
            review: null,
          };
          records[0] = record;
          return record;
        },
      ),
      activateLocalSimulation: vi.fn(async (id: string, version: number, reviewer: string) => {
        const record: TeachingRecord = {
          ...records[0]!,
          id,
          version: version + 1,
          status: 'local_active',
          review: { reviewer, date: '2026-10-21T12:00:00Z' },
        };
        records[0] = record;
        return record;
      }),
    } as unknown as AdminClient;
    const store = makeStore(),
      user = userEvent.setup();
    render(
      <I18nextProvider i18n={createI18n()}>
        <StoreProvider store={store}>
          <SimulationAuthor client={client} />
        </StoreProvider>
      </I18nextProvider>,
    );
    await user.click(screen.getByRole('button', { name: tx('teaching.author.save') }));
    await waitFor(() => expect(client.saveSimulationModel).toHaveBeenCalledTimes(1));
    expect(store.getState().teaching.authored).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: tx('teaching.author.review') }));
    await user.type(screen.getByLabelText(tx('teaching.author.reviewer')), 'Local reviewer');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: tx('teaching.author.activate') }));
    await waitFor(() => expect(store.getState().teaching.authored).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: tx('teaching.author.guide') }));
    const group = screen.getByRole('group', { name: tx('teaching.author.title_field') });
    const title = within(group).getByLabelText(tx('teaching.author.en'));
    await user.clear(title);
    await user.type(title, 'My reviewed local practical');
    await user.click(screen.getByRole('button', { name: tx('teaching.author.save') }));
    await waitFor(() => expect(client.saveSimulationModel).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(store.getState().teaching.authored).toHaveLength(0));
    expect(records[0]!.definition.revision).toBe(2);
  });
});
