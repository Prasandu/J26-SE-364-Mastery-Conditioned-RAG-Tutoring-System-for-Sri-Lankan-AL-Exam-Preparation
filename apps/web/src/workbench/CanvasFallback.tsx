import { useTranslation } from 'react-i18next';
import type { SceneModel } from './sceneModel';

/** Text description of the bench when the 3D view is unavailable. */
export function CanvasFallback({
  model,
  reason,
}: {
  model: SceneModel;
  reason: 'unsupported' | 'error';
}) {
  const { t } = useTranslation();
  const onBench = model.items.filter((i) => i.onBench && i.kind !== 'reagent');
  const levelKey =
    model.liquidLevel === 0
      ? 'ui.canvas.liquid_empty'
      : model.levelObservation
        ? `exp04.observation.${model.levelObservation}`
        : 'ui.canvas.liquid_present';
  return (
    <section className="canvas-fallback" aria-labelledby="fallback-title">
      <h3 id="fallback-title">{t('ui.canvas.fallback_title')}</h3>
      <p>
        {t(
          reason === 'unsupported' ? 'ui.canvas.fallback_unsupported' : 'ui.canvas.fallback_error',
        )}
      </p>
      <ul>
        <li>
          {t('ui.canvas.on_bench')}{' '}
          {onBench.length === 0
            ? t('ui.canvas.nothing')
            : onBench.map((i) => t(i.nameKey)).join(', ')}
        </li>
        <li>
          {t(
            model.watchGlassHasSolid
              ? 'ui.canvas.solid_on_watch_glass'
              : 'ui.canvas.watch_glass_empty',
          )}
        </li>
        <li>{t(model.funnelOnFlask ? 'ui.canvas.funnel_on' : 'ui.canvas.funnel_off')}</li>
        {model.workingFlaskId && <li>{t(levelKey)}</li>}
        {model.undissolvedVisible && <li>{t('ui.canvas.undissolved')}</li>}
        <li>{t(model.stoppered ? 'ui.canvas.stoppered' : 'ui.canvas.unstoppered')}</li>
        {model.labelAttached && <li>{t('ui.canvas.labelled')}</li>}
        {model.warning && <li className="text-warning">{t('ui.canvas.warning')}</li>}
      </ul>
    </section>
  );
}
