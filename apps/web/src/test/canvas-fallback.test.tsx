import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definition } from '../engine/content';
import { createI18n } from '../i18n';
import { LabCanvas, type FallbackReason } from '../workbench/LabCanvas';
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
  const fallback = vi.fn((reason: FallbackReason) => <p>fallback:{reason}</p>);
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <LabCanvas model={m} onPick={() => {}} label="lab" fallback={fallback} />
    </I18nextProvider>,
  );
  return fallback;
};

describe('LabCanvas (3D renderer)', () => {
  it('renders the fallback (the 2D laboratory in the app) when WebGL is unsupported', async () => {
    const fallback = await renderCanvas();
    expect(screen.getByText('fallback:unsupported')).toBeInTheDocument();
    expect(fallback).toHaveBeenCalledWith('unsupported');
  });

  it('renders the fallback via the error boundary when the scene fails at runtime', async () => {
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof original;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderCanvas();
    expect(await screen.findByText('fallback:error')).toBeInTheDocument();
    spy.mockRestore();
  });
});
