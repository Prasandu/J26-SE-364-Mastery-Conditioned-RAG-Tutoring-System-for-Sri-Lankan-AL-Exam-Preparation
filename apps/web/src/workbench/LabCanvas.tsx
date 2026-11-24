import type { Locale } from '@vlab/contracts';
import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../lib/format';
import type { LabRendererProps } from './labRenderer';
import { placementOf } from './sceneModel';
import type { CameraApi } from './scene3d/CameraRig';
import { cameraPose, type CameraPreset } from './scene3d/layout3d';
import { ViewControls } from './ViewControls';

const LabScene = lazy(() => import('./LabScene'));

export type FallbackReason = 'unsupported' | 'error';

/** True when the browser can create a WebGL context. */
export const detectWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * 3D laboratory renderer (lazy-loaded Three.js chunk). Without WebGL, or if the scene fails at
 * runtime, `fallback` is rendered instead; the session itself is never touched.
 */
export function LabCanvas({
  model,
  onPick,
  label,
  heldItemId = null,
  fallback,
  toolbarTarget,
  setupTargetId,
  onSetupAnchor,
  arrange,
  onArrange,
}: LabRendererProps & { fallback: (reason: FallbackReason) => ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'si' ? 'si' : 'en') as Locale;
  const [webgl] = useState(detectWebGL);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [camera, setCamera] = useState<CameraApi | null>(null);
  const [preset, setPreset] = useState<CameraPreset | 'custom'>('overview');
  const onCameraReady = useCallback((api: CameraApi) => setCamera(() => api), []);

  if (!webgl) return <>{fallback('unsupported')}</>;

  const labelLines = model.label
    ? [
        model.label.solutionName.slice(0, 22),
        model.label.concentration ? formatQuantity(model.label.concentration, locale) : '',
        model.label.preparationDate ?? '',
      ].filter(Boolean)
    : [];
  const sceneState = JSON.stringify(
    Object.fromEntries(
      model.items.map((i) => [i.id, { placement: placementOf(i, model), selected: i.highlighted }]),
    ),
  );
  const go = (next: CameraPreset) => {
    setPreset(next);
    camera?.goTo(cameraPose(next, model));
  };
  const zoom = (factor: number) => {
    setPreset('custom');
    camera?.zoom(factor);
  };
  const presetButton = (id: CameraPreset, key: string) => (
    <button
      type="button"
      className="lab-toolbar__button"
      aria-pressed={preset === id}
      disabled={!camera}
      onClick={() => go(id)}
    >
      {t(key)}
    </button>
  );

  return (
    <CanvasErrorBoundary fallback={fallback('error')}>
      <div className="lab3d" data-renderer="3d" data-scene-state={sceneState}>
        <ViewControls target={toolbarTarget}>
          <div className="lab-toolbar" role="toolbar" aria-label={t('ui.lab.view_controls')}>
            {presetButton('overview', 'ui.lab.view.overview')}
            {presetButton('balance', 'ui.lab.view.balance')}
            {presetButton('mark', 'ui.lab.view.mark')}
          </div>
        </ViewControls>
        <Suspense fallback={<p className="canvas-loading">{t('ui.canvas.loading')}</p>}>
          <div className="lab-canvas">
            <LabScene
              arrange={arrange}
              onArrange={onArrange}
              setupTargetId={setupTargetId}
              onSetupAnchor={onSetupAnchor}
              model={model}
              onPick={onPick}
              label={label}
              heldItemId={heldItemId}
              labelLines={labelLines}
              reducedMotion={reducedMotion}
              onCameraReady={onCameraReady}
            />
            {/* Anchored to the canvas itself (not .lab3d), so it never drifts over the hint text below. */}
            <div className="lab-zoom" role="group" aria-label={t('ui.lab.zoom_controls')}>
              <button
                type="button"
                className="lab-zoom__button"
                aria-label={t('ui.lab.zoom_in')}
                title={t('ui.lab.zoom_in')}
                disabled={!camera}
                onClick={() => zoom(0.75)}
              >
                +
              </button>
              <button
                type="button"
                className="lab-zoom__button"
                aria-label={t('ui.lab.zoom_out')}
                title={t('ui.lab.zoom_out')}
                disabled={!camera}
                onClick={() => zoom(1.3)}
              >
                −
              </button>
              <button
                type="button"
                className="lab-zoom__button"
                aria-label={t('ui.lab.reset_view')}
                title={t('ui.lab.reset_view')}
                disabled={!camera}
                onClick={() => go('overview')}
              >
                ↺
              </button>
            </div>
          </div>
        </Suspense>
        <p className="hint-text lab3d__hint">{t('ui.lab.orbit_hint')}</p>
      </div>
    </CanvasErrorBoundary>
  );
}
