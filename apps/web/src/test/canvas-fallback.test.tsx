import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definition } from '../engine/content';
import { createI18n, resources } from '../i18n';
import { LabCanvas } from '../workbench/LabCanvas';
import { buildSceneModel } from '../workbench/sceneModel';
import { makeLocalAdapter } from './helpers';

// Test boundary: a scene that throws, as when a WebGL context is lost.
vi.mock('../workbench/LabScene', () => ({
  default: () => {
    throw new Error('WebGL context lost');
  },
}));

const original = HTMLCanvasElement.prototype.getContext;
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original;
});

const model = async () => {
  const { session } = await makeLocalAdapter().createSession({
    mode: 'manual',
    guidanceLevel: null,
    locale: 'en',
    preLab: null,
  });
  return buildSceneModel(session, definition, { pendingApparatus: [], focusedItem: null });
};

const renderCanvas = async () => {
  const m = await model();
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <LabCanvas model={m} onPick={() => {}} />
    </I18nextProvider>,
  );
};

describe('LabCanvas', () => {
  it('falls back to the DOM description when WebGL is unsupported', async () => {
    await renderCanvas();
    expect(
      screen.getByText(resources.en.translation['ui.canvas.fallback_unsupported']!),
    ).toBeInTheDocument();
  });

  it('falls back via the error boundary when the scene fails at runtime', async () => {
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof original;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderCanvas();
    expect(
      await screen.findByText(resources.en.translation['ui.canvas.fallback_error']!),
    ).toBeInTheDocument();
    spy.mockRestore();
  });
});
