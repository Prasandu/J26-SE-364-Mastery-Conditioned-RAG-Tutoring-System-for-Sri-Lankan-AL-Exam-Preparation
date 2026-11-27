import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import teaching from '../../../../content/experiments/teaching/handbook21-30.v1.json';
import { practicalCapabilities } from '../engine/localAdapter';
import { bundledCatalogEntry } from '../engine/catalog';
import { definition } from '../engine/content';
import { resources } from '../i18n';
import { makeStore, renderApp } from './helpers';

/**
 * LAB-011 in the lab app: the library and the mode picker offer only what each practical's
 * engine supports, and every card that runs a bounded model says what it leaves out.
 */

const en = resources.en.translation;
const si = resources.si.translation;

const capabilityRegistry = practicalCapabilities.all;
const supportedModes = practicalCapabilities.modes;
const practicalCapability = practicalCapabilities.of;
const teachingTitle = (n: number) => teaching.find((d) => d.experimentNumber === n)!.title.en;
const card = (title: string) =>
  screen.getAllByRole('article').find((a) => within(a).queryByRole('heading', { name: title }))!;

describe('practical capabilities in the lab app', () => {
  it('builds one entry per bundled practical and keeps the catalog modes in step with it', () => {
    expect(capabilityRegistry).toHaveLength(30);
    expect(bundledCatalogEntry(definition, supportedModes(4)).modes).toEqual(supportedModes(4));
    expect(supportedModes(4)).toEqual(['automatic', 'guided', 'manual']);
    expect(supportedModes(1)).toEqual(['guided']);
    expect(supportedModes(99)).toEqual([]);
  });

  it('has an English and a Sinhala text for every unsupported feature it can report', () => {
    const codes = new Set(capabilityRegistry.flatMap((c) => c.unsupported));
    for (const code of codes) {
      expect(en[`capability.unsupported.${code}`], code).toBeTruthy();
      expect(si[`capability.unsupported.${code}`], code).toBeTruthy();
    }
  });

  it('says what a bounded handbook model and a teaching template leave out', async () => {
    const store = makeStore();
    store.getState().navigate('library');
    renderApp(store);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(30));

    for (const title of [en['ui.handbook.exp01.title']!, teachingTitle(21)]) {
      const note = within(card(title)).getByText(en['capability.summary']!).closest('details')!;
      expect(note).toHaveTextContent(`${en['capability.modes']} ${en['ui.mode.guided.title']}`);
      const missing = within(note).getByRole('list', { name: en['capability.not_included']! });
      expect(missing).toHaveTextContent(en['capability.unsupported.automatic_mode']!);
      expect(missing).toHaveTextContent(en['capability.unsupported.manual_mode']!);
      expect(missing).toHaveTextContent(en['capability.unsupported.competency_estimate']!);
      expect(note).toHaveTextContent(en['capability.engine_results']!);
    }
  });

  it('offers the full engine every mode and guidance level it supports', async () => {
    const store = makeStore();
    store.getState().navigate('mode');
    renderApp(store);

    const radios = await screen.findAllByRole('radio');
    expect(radios.map((r) => r.id).filter((id) => id.startsWith('mode-'))).toEqual(
      supportedModes(4).map((m) => `mode-${m}`),
    );
    store.getState().selectMode('guided', 'beginner');
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('radio')
          .filter((r) => r.id.startsWith('level-'))
          .map((r) => r.id),
      ).toEqual(practicalCapability(4)!.guidanceLevels.map((l) => `level-${l}`)),
    );
  });
});
