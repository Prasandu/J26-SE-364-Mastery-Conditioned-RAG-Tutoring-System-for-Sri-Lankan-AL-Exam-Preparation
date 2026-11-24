import { preparePractical, reflectAndReport, stageButton } from './practical-journey-helpers';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { calculateHandbook, handbookModels, initialHandbookRun } from '@vlab/simulation-core';
import { resources } from '../i18n';
import { makeStore, renderApp } from './helpers';

afterEach(cleanup);
const en = resources.en.translation;

describe('handbook model integration', () => {
  it('translates every model action, scope, setting and possible outcome', () => {
    const keys = new Set<string>();
    for (const model of handbookModels.values()) {
      keys.add(model.scopeKey);
      keys.add(`labs.method.${model.number}`);
      keys.add(`labs.precaution.${model.number}`);
      keys.add(`labs.graphic.${model.graphic}`);
      for (const id of model.steps) keys.add(`labs.action.${id}`);
      for (const control of model.controls) {
        keys.add(control.labelKey);
        for (const option of control.options ?? [control.initial]) {
          const inputs = { ...initialHandbookRun(model.number).inputs, [control.id]: option };
          if (model.number === 9 && inputs.medium === 'dilute_HCl') continue;
          const result = calculateHandbook(model.number, inputs);
          keys.add(result.observation);
          if (result.shape) keys.add(`labs.shape.${result.shape}`);
          for (const r of result.readings) keys.add(r.label);
          if (typeof option === 'string' && (option.includes('_') || /^[a-z]+$/.test(option)))
            keys.add(`labs.choice.${option}`);
        }
      }
    }
    for (const locale of ['en', 'si'] as const)
      for (const key of keys)
        expect(resources[locale].translation[key], `${locale}: ${key}`).toBeTruthy();
  });

  it.each([...handbookModels.keys()])(
    'opens practical %i without replacing Experiment 4 engine state',
    async (number) => {
      const store = makeStore();
      const legacy = store.getState().engine;
      store.getState().openHandbookLab(number);
      const { user } = renderApp(store);
      await screen.findByRole('heading', { name: en['ui.journey.overview']! });
      await preparePractical(user);
      await screen.findByRole('img');
      expect(
        screen.getByRole('button', {
          name: new RegExp(
            en[`labs.action.${handbookModels.get(number)!.steps[0]}`]!.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&',
            ),
          ),
        }),
      ).toBeEnabled();
      expect(store.getState().engine).toBe(legacy);
      expect(store.getState().view).toBe('handbook_lab');
    },
  );

  it('runs synthetic calorimetry, records labelled readings, and preserves exact notes on revisit', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(7);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: en['ui.journey.overview']! });
    await preparePractical(user);
    await screen.findByRole('img');
    expect(screen.getByText(en['labs.synthetic_notice']!)).toBeVisible();
    expect(screen.queryByLabelText(/Maximum mixture temperature/)).toBeNull();
    for (const id of handbookModels.get(7)!.steps)
      await user.click(screen.getByRole('button', { name: new RegExp(en[`labs.action.${id}`]!) }));
    await user.click(screen.getByRole('button', { name: en['labs.record']! }));
    await user.click(stageButton('notebook'));
    await user.type(screen.getByLabelText(en['labs.notes']!), 'My exact text. සිංහල');
    await user.click(stageButton('workbench'));
    await user.click(screen.getByRole('button', { name: en['labs.finish']! }));
    await reflectAndReport(user);
    expect(screen.getByText(en['labs.choice.practice_dataset']!)).toBeVisible();
    expect(screen.getByText('My exact text. සිංහල')).toBeVisible();
    act(() => {
      store.getState().navigate('library');
      store.getState().openHandbookLab(7);
    });
    expect(store.getState().handbookLab.runs[7]!.notes).toBe('My exact text. සිංහල');
    expect(store.getState().handbookLab.runs[7]!.trials).toHaveLength(1);
  });
});
