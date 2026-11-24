import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import preparation from '../../../../content/library/handbook-preparation.v1.json';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { handbookPractice, teachingPractice } from '../engine/localAdapter';
import { resources } from '../i18n';
import { makeStore, renderApp } from './helpers';
import { preparePractical, reflectAndReport, stageButton } from './practical-journey-helpers';

afterEach(cleanup);
const tx = (key: string) => resources.en.translation[key]!;

describe('complete practical journeys', () => {
  it('covers every non-4 practical with source-linked, bilingual preparation and reflection', () => {
    expect(preparation.documentSha256).toBe(handbook.documentSha256);
    expect(preparation.translationStatus.si).toBe('draft');
    expect(preparation.entries.map((e) => e.experimentNumber)).toEqual([
      ...handbookPractice.models.keys(),
    ]);
    for (const e of preparation.entries) {
      const source = handbook.entries.find((x) => x.experimentNumber === e.experimentNumber)!;
      expect(e.preLabPdfPage).toBe(source.pdfPage);
      expect(e.postLabPdfPage).toBe(source.pdfPageEnd);
      for (const prompt of [...e.preLab, ...e.postLab]) {
        expect(prompt.en.length).toBeGreaterThan(15);
        expect(prompt.si).toMatch(/[\u0d80-\u0dff]/);
      }
    }
    for (const d of teachingPractice.bundled) {
      expect(d.preLab.length).toBeGreaterThan(0);
      expect(d.postLab.length).toBeGreaterThan(0);
    }
  });

  it('requires written preparation and both setup checks; writing never advances the chemistry', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(1);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: tx('ui.journey.overview') });
    expect(stageButton('workbench')).toBeDisabled();
    expect(stageButton('reflection')).toBeDisabled();
    expect(stageButton('report')).toBeDisabled();
    await user.click(stageButton('prelab'));
    expect(stageButton('setup')).toBeDisabled();
    for (const field of screen.getAllByRole('textbox'))
      fireEvent.change(field, { target: { value: '   ' } });
    expect(stageButton('setup')).toBeDisabled();
    for (const field of screen.getAllByRole('textbox'))
      fireEvent.change(field, { target: { value: 'My reasoning.' } });
    expect(store.getState().handbookLab.runs[1]!.sequence).toBe(0);
    await user.click(stageButton('setup'));
    const start = screen.getByRole('button', { name: tx('ui.journey.start') });
    expect(start).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    expect(start).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(start);
    await screen.findByRole('img');
    expect(store.getState().handbookLab.runs[1]!.safety).toBe(true);
    expect(store.getState().handbookLab.runs[1]!.step).toBe(0);
    expect(stageButton('reflection')).toBeDisabled();
  });

  it('keeps answers across locale, stages and library revisits, isolated by practical', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(1);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: tx('ui.journey.overview') });
    await user.click(stageButton('prelab'));
    const exact = 'My own answer.\nසිංහල';
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: exact } });
    act(() => store.getState().setLocale('si'));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue(exact);
    act(() => store.getState().setLocale('en'));
    await user.click(screen.getByRole('button', { name: tx('labs.library') }));
    act(() => store.getState().openHandbookLab(2));
    await screen.findByRole('heading', { name: tx('ui.journey.overview') });
    await user.click(stageButton('prelab'));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('');
    await user.click(screen.getByRole('button', { name: tx('labs.library') }));
    act(() => store.getState().openHandbookLab(1));
    expect((await screen.findAllByRole('textbox'))[0]).toHaveValue(exact);
    expect(store.getState().handbookLab.runs[1]!.step).toBe(0);
  });

  it('requires a completed engine run and reflection, and includes exact writing in the report', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(1);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: tx('ui.journey.overview') });
    await preparePractical(user);
    for (const step of handbookPractice.models.get(1)!.steps)
      await user.click(screen.getByRole('button', { name: new RegExp(tx(`labs.action.${step}`)) }));
    await user.click(screen.getByRole('button', { name: tx('labs.record') }));
    expect(stageButton('reflection')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: tx('labs.finish') }));
    expect(stageButton('notebook')).toHaveAttribute('aria-current', 'step');
    fireEvent.change(screen.getByLabelText(tx('labs.notes')), {
      target: { value: 'Exact bench notes.' },
    });
    expect(stageButton('report')).toBeDisabled();
    await reflectAndReport(user);
    expect(screen.getByText('Exact bench notes.')).toBeVisible();
    expect(screen.getByText('My reflection on the recorded evidence.')).toBeVisible();
    expect(screen.getAllByText('My reasoned prediction and preparation.')).toHaveLength(2);
    const rail = screen.getByRole('navigation', { name: tx('ui.journey.navigation') });
    expect(within(rail).getAllByRole('button')).toHaveLength(7);
  });
});
