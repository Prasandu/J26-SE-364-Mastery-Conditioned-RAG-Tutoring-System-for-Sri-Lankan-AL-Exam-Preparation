import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CanvasFallback } from './CanvasFallback';
import type { SceneModel } from './sceneModel';

const LabScene = lazy(() => import('./LabScene'));

/** True when the browser can create a WebGL context. */
export const detectWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

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

/** Supplementary 3D view. The accessible DOM controls remain the authoritative interaction path. */
export function LabCanvas({ model, onPick }: { model: SceneModel; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const [webgl] = useState(detectWebGL);
  if (!webgl) return <CanvasFallback model={model} reason="unsupported" />;
  return (
    <CanvasErrorBoundary fallback={<CanvasFallback model={model} reason="error" />}>
      <Suspense fallback={<p className="canvas-loading">{t('ui.canvas.loading')}</p>}>
        <div className="lab-canvas">
          <LabScene model={model} onPick={onPick} label={t('ui.canvas.label')} />
        </div>
      </Suspense>
    </CanvasErrorBoundary>
  );
}
