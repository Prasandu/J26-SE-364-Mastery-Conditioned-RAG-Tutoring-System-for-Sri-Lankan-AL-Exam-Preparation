import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExperimentCard } from '../components/ExperimentCard';
import { HandbookPracticalCard } from '../components/HandbookPracticalCard';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';
import { teachingPractice } from '../engine/localAdapter';
import type { TeachingDefinition } from '@vlab/contracts';

function TeachingCard({ definition }: { definition: TeachingDefinition }) {
  const { t, i18n } = useTranslation();
  const open = useSession((s) => s.openTeaching);
  const locale = i18n.language === 'si' ? 'si' : 'en';
  return (
    <article className="card handbook-card teaching-card" aria-label={definition.title[locale]}>
      <div className="experiment-card__top">
        <p className="experiment-card__number">
          {t('ui.card.experiment_number', { number: definition.experimentNumber })}
        </p>
        <span className="badge">{t('teaching.available')}</span>
      </div>
      <h2 className="experiment-card__title">{definition.title[locale]}</h2>
      <p className="hint-text">{definition.unitTitle[locale]}</p>
      <p>{definition.aims[0]?.[locale]}</p>
      <details>
        <summary>{t('teaching.scope')}</summary>
        <p>{definition.limitations[locale]}</p>
      </details>
      <button
        className="button button--primary"
        type="button"
        onClick={() => open(definition)}
        aria-label={t('teaching.open_named', { number: definition.experimentNumber })}
      >
        {t('teaching.open')}
      </button>
    </article>
  );
}

/** Handbook references alongside the published, supported simulation catalog. */
export function LibraryView() {
  const { t, i18n } = useTranslation();
  const catalog = useSession((s) => s.catalog);
  const loadCatalog = useSession((s) => s.loadCatalog);
  const authored = useSession((s) => s.teaching.authored);
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const definitions = [...teachingPractice.bundled, ...authored];
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState('all');
  const ids = { search: useId(), unit: useId(), count: useId() };
  const entries = [
    ...handbook.entries.map((reference) => ({
      experimentNumber: reference.experimentNumber,
      unitNumber: reference.unitNumber,
      title: t(reference.titleKey),
      unitTitle: t(reference.unitTitleKey),
      card: catalog.items.find((e) => e.experimentNumber === reference.experimentNumber) ? (
        <ExperimentCard
          key={reference.experimentNumber}
          entry={catalog.items.find((e) => e.experimentNumber === reference.experimentNumber)!}
        />
      ) : (
        <HandbookPracticalCard key={reference.experimentNumber} entry={reference} />
      ),
    })),
    ...definitions.map((d) => ({
      experimentNumber: d.experimentNumber,
      unitNumber: d.unitNumber,
      title: d.title[locale],
      unitTitle: d.unitTitle[locale],
      card: <TeachingCard key={d.id} definition={d} />,
    })),
  ].sort((a, b) => a.experimentNumber - b.experimentNumber);

  useEffect(() => {
    if (catalog.status === 'idle') void loadCatalog();
  }, [catalog.status, loadCatalog]);

  const units = useMemo(
    () =>
      [
        ...new Map([
          ...handbook.entries.map((e) => [e.unitNumber, t(e.unitTitleKey)] as const),
          ...[...teachingPractice.bundled, ...authored].map(
            (d) => [d.unitNumber, d.unitTitle[locale]] as const,
          ),
        ]).entries(),
      ].sort((a, b) => a[0] - b[0]),
    [t, authored, locale],
  );
  const needle = query.trim().toLocaleLowerCase();
  const visible = entries.filter((e) => {
    const matchesUnit = unit === 'all' || String(e.unitNumber) === unit;
    const text = `${e.experimentNumber} ${e.title} ${t('ui.card.experiment_number', {
      number: e.experimentNumber,
    })}`.toLocaleLowerCase();
    return matchesUnit && (needle === '' || text.includes(needle));
  });

  return (
    <section className="view view--library" aria-labelledby="library-title">
      <PageHeader id="library-title" title={t('ui.library.title')} lead={t('ui.library.intro')} />

      <div className="toolbar" role="search" aria-label={t('ui.library.search_region')}>
        <div className="toolbar__field toolbar__field--grow">
          <label htmlFor={ids.search}>{t('ui.library.search_label')}</label>
          <div className="input-icon">
            <Icon name="search" size={18} />
            <input
              id={ids.search}
              type="search"
              value={query}
              placeholder={t('ui.library.search_placeholder')}
              onChange={(e) => setQuery(e.target.value)}
              aria-describedby={ids.count}
            />
          </div>
        </div>
        <div className="toolbar__field">
          <label htmlFor={ids.unit}>{t('ui.library.unit_filter')}</label>
          <select id={ids.unit} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="all">{t('ui.library.all_units')}</option>
            {units.map(([number, titleKey]) => (
              <option key={number} value={String(number)}>
                {titleKey}
              </option>
            ))}
          </select>
        </div>
      </div>

      {catalog.status === 'ready' && (
        <p id={ids.count} className="result-count" aria-live="polite">
          {t('ui.library.result_count', { count: visible.length, total: entries.length })}
        </p>
      )}

      {(catalog.status === 'idle' || catalog.status === 'loading') && (
        <StatusMessage tone="loading" title={t('ui.library.loading')} />
      )}
      {catalog.status === 'error' && (
        <StatusMessage
          tone="error"
          title={t('ui.library.error_title')}
          action={
            <button type="button" className="button" onClick={() => void loadCatalog()}>
              {t('ui.connection.retry')}
            </button>
          }
        >
          <p>{t('ui.library.error_text')}</p>
        </StatusMessage>
      )}
      {catalog.status === 'ready' && catalog.items.length === 0 && (
        <StatusMessage tone="empty" title={t('ui.library.empty_title')}>
          <p>{t('ui.library.empty_text')}</p>
        </StatusMessage>
      )}
      {catalog.status === 'ready' && visible.length === 0 && (
        <StatusMessage
          tone="empty"
          title={t('ui.library.no_match_title')}
          action={
            <button
              type="button"
              className="button"
              onClick={() => {
                setQuery('');
                setUnit('all');
              }}
            >
              {t('ui.library.clear_filters')}
            </button>
          }
        />
      )}
      {catalog.status === 'ready' && visible.length > 0 && (
        <div className="library-list">{visible.map((entry) => entry.card)}</div>
      )}
      <p className="hint-text library-note">{t('ui.library.hidden_note')}</p>
    </section>
  );
}
