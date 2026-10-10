import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { makeStore, renderApp, startSession } from './helpers';

// Test boundary: replace only the WebGL canvas with buttons that call the real `onPick` prop.
vi.mock('../workbench/LabCanvas', () => ({
  LabCanvas: ({ onPick }: { onPick: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onPick('watch_glass')}>
        3d-pick-watch-glass
      </button>
      <button type="button" onClick={() => onPick('reagent_na2co3')}>
        3d-pick-reagent
      </button>
    </div>
  ),
}));

const tx = (k: string) => resources.en.translation[k] ?? k;
const selectButton = () =>
  within(document.getElementById('action-form-select_apparatus')!).getByRole('button', {
    name: tx('exp04.action.select_apparatus'),
  });

describe('3D selection and DOM controls share one action path', () => {
  it('scene pick and list tick produce identical store state and the same dispatched action', async () => {
    const viaScene = makeStore();
    const viaDom = makeStore();
    await startSession(viaScene, 'manual');
    await startSession(viaDom, 'manual');

    const scene = renderApp(viaScene);
    await scene.user.click(screen.getByRole('button', { name: '3d-pick-watch-glass' }));
    await scene.user.click(selectButton());
    await waitFor(() =>
      expect(viaScene.getState().session!.bench.selectedApparatus).toEqual(['watch_glass']),
    );
    scene.unmount();

    const dom = renderApp(viaDom);
    await dom.user.click(document.getElementById('equip-watch_glass')!);
    await dom.user.click(selectButton());
    await waitFor(() =>
      expect(viaDom.getState().session!.bench.selectedApparatus).toEqual(['watch_glass']),
    );

    const action = (s: typeof viaDom) => s.getState().session!.events.at(-1)?.action;
    expect(action(viaScene)).toEqual(action(viaDom));
    expect(viaScene.getState().session!.bench).toEqual(viaDom.getState().session!.bench);
  });

  it('picking the reagent jar focuses the same item as the DOM reagent button', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    await user.click(screen.getByRole('button', { name: '3d-pick-reagent' }));
    expect(store.getState().ui.focusedItem).toBe('reagent_na2co3');
  });
});
