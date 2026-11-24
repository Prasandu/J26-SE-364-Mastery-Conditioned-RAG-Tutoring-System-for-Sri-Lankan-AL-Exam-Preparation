import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { makeStore, renderApp, startSession } from './helpers';

// Regression: selectors returning a fresh [] / {} make React warn that getSnapshot is not cached.
describe('store selectors return stable snapshots', () => {
  it('rendering the notebook and workbench logs no getSnapshot warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = makeStore();
    await startSession(store, 'manual');
    store.getState().navigate('notebook');
    renderApp(store);
    await screen.findByLabelText(resources.en.translation['ui.notebook.field.aim']!);
    store.getState().navigate('workbench');
    store.getState().setWorkbenchTab('materials');
    await screen.findByRole('heading', { name: resources.en.translation['ui.equipment.title']! });
    const snapshotWarnings = errors.mock.calls.filter((c) => String(c[0]).includes('getSnapshot'));
    errors.mockRestore();
    expect(snapshotWarnings).toEqual([]);
  });
});
