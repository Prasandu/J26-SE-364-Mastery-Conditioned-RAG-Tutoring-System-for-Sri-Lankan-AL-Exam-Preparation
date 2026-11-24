import type { Locale } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../lib/format';
import type { FallbackReason } from './LabCanvas';
import type { SceneModel } from './sceneModel';

/** Notice shown above the 2D laboratory when the 3D renderer cannot run. */
export function CanvasFallback({ reason }: { reason: FallbackReason }) {
  const { t } = useTranslation();
  return (
    <p className="canvas-fallback" role="status">
      {t(reason === 'unsupported' ? 'ui.canvas.fallback_unsupported' : 'ui.canvas.fallback_error')}
    </p>
  );
}

/**
 * Text description of the bench, shown under both renderers: the static accessible alternative to
 * the drawings. Every line comes from the shared scene model (public projection only).
 */
export function BenchDescription({ model }: { model: SceneModel }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language === 'si' ? 'si' : 'en') as Locale;
  const onBench = model.items.filter((i) => i.onBench && i.kind !== 'reagent');
  const levelKey =
    model.liquidLevel === 0
      ? 'ui.canvas.liquid_empty'
      : model.levelObservation
        ? `exp04.observation.${model.levelObservation}`
        : 'ui.canvas.liquid_present';
  const { sliderSetting, watchGlassReading, pointer } = model.balance;
  return (
    <section className="bench-description" aria-labelledby="bench-description-title">
      <h3 id="bench-description-title">{t('ui.canvas.fallback_title')}</h3>
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
        {watchGlassReading && (
          <li>
            {t('ui.lab.readout.watch_glass_reading')}{' '}
            <strong>{formatQuantity(watchGlassReading, locale)}</strong>
          </li>
        )}
        {sliderSetting && (
          <li>
            {t('ui.lab.readout.slider_setting')}{' '}
            <strong>{formatQuantity(sliderSetting, locale)}</strong>
          </li>
        )}
        {pointer && <li>{t(`exp04.observation.pointer_${pointer}_zero`)}</li>}
        <li>{t(model.funnelOnFlask ? 'ui.canvas.funnel_on' : 'ui.canvas.funnel_off')}</li>
        {model.workingFlaskId && <li>{t(levelKey)}</li>}
        {model.undissolvedVisible && <li>{t('ui.canvas.undissolved')}</li>}
        {model.spilled && <li>{t('exp04.observation.solid_spilled')}</li>}
        <li>{t(model.stoppered ? 'ui.canvas.stoppered' : 'ui.canvas.unstoppered')}</li>
        {model.labelAttached && <li>{t('ui.canvas.labelled')}</li>}
        {model.warning && <li className="text-warning">{t('ui.canvas.warning')}</li>}
      </ul>
    </section>
  );
}
