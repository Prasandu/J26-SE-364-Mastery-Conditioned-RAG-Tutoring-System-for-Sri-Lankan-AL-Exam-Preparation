import { useTranslation } from 'react-i18next';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { Icon } from './ui/Icon';
import { handbookPractice } from '../engine/localAdapter';
import { useSession } from '../store/StoreProvider';

/** A source-backed reference, deliberately separate from the runnable engine catalog. */
export function HandbookPracticalCard({ entry }: { entry: (typeof handbook.entries)[number] }) {
  const { t, i18n } = useTranslation();
  const open = useSession((s) => s.openHandbookLab);
  const model = handbookPractice.models.get(entry.experimentNumber);
  const titleId = `handbook-${entry.experimentNumber}-title`;
  return (
    <article className="card handbook-card" aria-labelledby={titleId}>
      <div className="experiment-card__top">
        <p className="experiment-card__number">
          {t('ui.card.experiment_number', { number: entry.experimentNumber })}
        </p>
        <span className="badge">{t(model ? 'labs.available' : 'ui.handbook.reference')}</span>
      </div>
      <h2 id={titleId} className="experiment-card__title">
        {t(entry.titleKey)}
      </h2>
      <p className="hint-text">{t(entry.unitTitleKey)}</p>
      <details className="handbook-card__details">
        <summary>
          <Icon name="book" size={16} /> {t('ui.handbook.view_reference')}
        </summary>
        <p>{t(entry.aimKey)}</p>
        <p className="hint-text">
          {t('ui.source.citation', {
            title: t(handbook.documentTitleKey),
            pdf: `${entry.pdfPage}–${entry.pdfPageEnd}`,
            printed: `${entry.printedPage}–${entry.printedPageEnd}`,
          })}
        </p>
        {i18n.language === 'si' && (
          <p className="hint-text">{t('ui.handbook.translation_draft')}</p>
        )}
      </details>
      {model ? (
        <button
          type="button"
          className="button button--primary"
          onClick={() => open(entry.experimentNumber)}
          aria-label={t('labs.open_named', { number: entry.experimentNumber })}
        >
          {t('labs.open')} <Icon name="arrow" size={16} />
        </button>
      ) : (
        <p className="hint-text handbook-card__availability">{t('ui.handbook.unavailable')}</p>
      )}
    </article>
  );
}
