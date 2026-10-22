import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeStore, renderApp } from './helpers';
import { resources } from '../i18n';
import { stageButton, reflectAndReport } from './practical-journey-helpers';
import { handbookPractice } from '../engine/localAdapter';

const en = resources.en.translation;
const si = resources.si.translation;

describe('optional preparation and bilingual answer feedback', () => {
  it('explicitly skips unanswered pre-lab while retaining partial text and requiring safety', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(1);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: en['ui.journey.overview']! });
    await user.click(stageButton('prelab'));
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'මගේ අදහස' } });
    await user.click(screen.getByRole('button', { name: en['ui.journey.skip_prelab']! }));
    expect(screen.getByText(en['ui.journey.skipped_note']!)).toBeVisible();
    const start = screen.getByRole('button', { name: en['ui.journey.start']! });
    expect(start).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    expect(start).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(start);
    expect(stageButton('workbench')).toHaveAttribute('aria-current', 'step');
    expect(store.getState().handbookLab.runs[1]!.step).toBe(0);
    await user.click(stageButton('prelab'));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('මගේ අදහස');
  });

  it('offers the same explicit skip for Experiment 4 without bypassing guided safety', async () => {
    const store = makeStore();
    store.getState().navigate('prelab');
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: en['ui.journey.skip_prelab']! }));
    expect(store.getState().view).toBe('mode');
    expect(store.getState().canStart()).toBe(false);
  });

  it('includes the skip and unanswered fields in the final report without awarding completion for them', async () => {
    const store = makeStore();
    store.getState().openHandbookLab(1);
    const { user } = renderApp(store);
    await screen.findByRole('heading', { name: en['ui.journey.overview']! });
    await user.click(stageButton('prelab'));
    await user.click(screen.getByRole('button', { name: en['ui.journey.skip_prelab']! }));
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: en['ui.journey.start']! }));
    act(() => {
      for (const id of handbookPractice.models.get(1)!.steps)
        store.getState().actHandbookLab({ type: 'step', id });
      store.getState().actHandbookLab({ type: 'record' });
    });
    await user.click(screen.getByRole('button', { name: en['labs.finish']! }));
    await reflectAndReport(user);
    expect(screen.getByText(en['ui.journey.skipped_note']!)).toBeVisible();
    expect(screen.getAllByText(en['ui.journey.not_answered']!)).toHaveLength(2);
  });

  it('checks Sinhala under an English UI, invalidates stale feedback, and never grades an unsupported question', async () => {
    const store = makeStore();
    store.getState().navigate('prelab');
    const { user } = renderApp(store);
    const answer = screen.getByLabelText(`2. ${en['exp04.prelab.q2.prompt']!}`);
    const field = answer.closest('.field')! as HTMLElement;
    fireEvent.change(answer, {
      target: { value: 'ද්‍රාව්‍යයේ මවුල ප්‍රමාණය ද්‍රාවණයේ පරිමාවෙන් බෙදන්න.' },
    });
    await user.click(within(field).getByRole('button', { name: en['ui.answers.check']! }));
    expect(within(field).getByRole('status')).toHaveAttribute('lang', 'si');
    expect(within(field).getByText(si['ui.answers.matches_guide']!)).toBeVisible();
    fireEvent.change(answer, { target: { value: 'c = V/n' } });
    expect(within(field).queryByRole('status')).toBeNull();
    act(() => store.getState().setLocale('si'));
    await user.click(within(field).getByRole('button', { name: si['ui.answers.check']! }));
    expect(within(field).getByText(en['ui.answers.needs_revision']!)).toBeVisible();
    const unknown = screen.getByLabelText(`1. ${si['exp04.prelab.q1.prompt']!}`);
    fireEvent.change(unknown, { target: { value: 'මගේ පිළිතුර.' } });
    await user.click(
      within(unknown.closest('.field')! as HTMLElement).getByRole('button', {
        name: si['ui.answers.check']!,
      }),
    );
    expect(screen.getByText(si['ui.answers.review_required']!)).toBeVisible();
  });
});
