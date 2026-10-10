import { useTranslation } from 'react-i18next';
import { definition } from '../engine/content';
import { useSession } from '../store/StoreProvider';

export function ExperimentCard() {
  const { t } = useTranslation();
  const navigate = useSession((s) => s.navigate);
  return (
    <article className="card experiment-card" aria-labelledby="exp04-card-title">
      <p className="experiment-card__number">
        {t('ui.card.experiment_number', { number: definition.experimentNumber })}
      </p>
      <h2 id="exp04-card-title">{t(definition.titleKey)}</h2>
      <dl className="experiment-card__facts">
        <dt>{t('ui.card.unit')}</dt>
        <dd>{t(definition.syllabusUnit.titleKey)}</dd>
        <dt>{t('ui.card.duration_label')}</dt>
        <dd>{t('ui.card.duration_value')}</dd>
        <dt>{t('ui.card.modes')}</dt>
        <dd>{t('ui.card.modes_value')}</dd>
        <dt>{t('ui.card.languages')}</dt>
        <dd>{t('ui.card.languages_value')}</dd>
      </dl>
      <button type="button" className="button button--primary" onClick={() => navigate('overview')}>
        {t('ui.card.start')}
      </button>
    </article>
  );
}
