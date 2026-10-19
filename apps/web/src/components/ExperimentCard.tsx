import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../engine/adapter';
import { translationMeta } from '../i18n';
import { useSession } from '../store/StoreProvider';
import { LabIllustration } from '../workbench/lab2d/LabIllustration';
import { Icon } from './ui/Icon';

/** Catalog card for one published, runnable practical. Every fact comes from the catalog entry. */
export function ExperimentCard({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation();
  const navigate = useSession((s) => s.navigate);
  const titleId = `${entry.experimentId}-card-title`;
  const sinhalaDraft = translationMeta('si', 'exp04').translationStatus === 'draft';
  return (
    <article className="card experiment-card" aria-labelledby={titleId}>
      <div className="experiment-card__media">
        <LabIllustration compact />
      </div>
      <div className="experiment-card__body">
        <div className="experiment-card__top">
          <p className="experiment-card__number">
            {t('ui.card.experiment_number', { number: entry.experimentNumber })}
          </p>
          <span className="badge badge--ok">
            <Icon name="check" size={14} /> {t('ui.card.runnable')}
          </span>
        </div>
        <h2 id={titleId} className="experiment-card__title">
          {t(entry.titleKey)}
        </h2>
        <dl className="facts experiment-card__facts">
          <dt>{t('ui.card.unit')}</dt>
          <dd>{t(entry.unitTitleKey)}</dd>
          <dt>{t('ui.card.modes')}</dt>
          <dd>
            <ul className="chip-list">
              {entry.modes.map((m) => (
                <li key={m} className="chip">
                  {t(`ui.mode.${m}.title`)}
                </li>
              ))}
            </ul>
          </dd>
          <dt>{t('ui.card.languages')}</dt>
          <dd>
            <ul className="chip-list">
              {entry.locales.map((l) => (
                <li key={l} className="chip" lang={l}>
                  {t(`ui.language.${l}`)}
                  {l === 'si' && sinhalaDraft && (
                    <span className="chip__note"> · {t('ui.card.draft')}</span>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </div>
      <button
        type="button"
        className="button button--primary experiment-card__action"
        onClick={() => navigate('overview')}
      >
        {t('ui.card.start')} <Icon name="arrow" size={18} />
      </button>
    </article>
  );
}
