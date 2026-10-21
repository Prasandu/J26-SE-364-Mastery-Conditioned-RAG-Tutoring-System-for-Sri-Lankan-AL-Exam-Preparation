import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { resources } from '../i18n';
import { makeLocalAdapter, makeStore, renderApp } from './helpers';

const en = resources.en.translation;
const si = resources.si.translation;

describe('first 20 handbook practicals', () => {
  it('retains source identity, complete numbering, page ranges and bilingual keys', () => {
    expect(handbook.documentSha256).toBe(
      '1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe',
    );
    expect(handbook.entries.map((e) => e.experimentNumber)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    for (const entry of handbook.entries) {
      expect(entry.pdfPage).toBe(entry.printedPage + 8);
      expect(entry.pdfPageEnd).toBe(entry.printedPageEnd + 8);
      expect(entry.pdfPageEnd).toBeGreaterThanOrEqual(entry.pdfPage);
      for (const key of [entry.titleKey, entry.unitTitleKey, entry.aimKey]) {
        expect(en[key], key).toBeTruthy();
        expect(si[key], key).toBeTruthy();
      }
    }
  });

  it('shows 20 ordered entries with 19 local teaching models and the existing Experiment 4', async () => {
    const store = makeStore();
    store.getState().navigate('library');
    renderApp(store);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(30));
    const cards = screen.getAllByRole('article');
    for (const [i, entry] of handbook.entries.entries()) {
      expect(
        within(cards[i]!).getByRole('heading', { name: en[entry.titleKey]! }),
      ).toBeInTheDocument();
      if (entry.experimentNumber !== 4) expect(within(cards[i]!).getByRole('button')).toBeEnabled();
    }
    expect(screen.getAllByText(en['labs.available']!)).toHaveLength(19);
    expect(screen.getAllByRole('button', { name: en['ui.card.start']! })).toHaveLength(1);
  });

  it('filters all six units and searches the newly added titles', async () => {
    const store = makeStore();
    store.getState().navigate('library');
    const { user } = renderApp(store);
    await screen.findByRole('button', { name: en['ui.card.start']! });
    const unit = screen.getByLabelText(en['ui.library.unit_filter']!);
    expect(within(unit).getAllByRole('option')).toHaveLength(11);
    await user.selectOptions(unit, '6');
    expect(screen.getAllByRole('article')).toHaveLength(15);
    await user.type(screen.getByLabelText(en['ui.library.search_label']!), 'KMnO₄');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: en['ui.handbook.exp20.title']! }),
    ).toBeInTheDocument();
  });

  it('shows aims, exact source pages and draft translation status in Sinhala', async () => {
    const store = makeStore();
    store.getState().setLocale('si');
    store.getState().navigate('library');
    const { user } = renderApp(store);
    const card = await screen.findByRole('article', { name: si['ui.handbook.exp20.title']! });
    await user.click(within(card).getByText(si['ui.handbook.view_reference']!));
    expect(within(card).getByText(si['ui.handbook.exp20.aim']!)).toBeVisible();
    expect(within(card).getByText(/75–76/)).toHaveTextContent('67–68');
    expect(within(card).getByText(si['ui.handbook.translation_draft']!)).toBeVisible();
  });

  it('does not invent a published Experiment 4 when the engine catalog is empty', async () => {
    const store = makeStore(42, { ...makeLocalAdapter(), listExperiments: async () => [] });
    store.getState().navigate('library');
    renderApp(store);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(30));
    expect(screen.queryByRole('button', { name: en['ui.card.start']! })).toBeNull();
    expect(screen.getAllByText(en['ui.handbook.reference']!)).toHaveLength(1);
    expect(screen.getAllByText(en['labs.available']!)).toHaveLength(19);
  });
});
