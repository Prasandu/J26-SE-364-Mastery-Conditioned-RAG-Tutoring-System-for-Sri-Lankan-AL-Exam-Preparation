import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExperimentCard } from '../components/ExperimentCard';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useSession } from '../store/StoreProvider';

/** Searchable catalog of published, runnable practicals (real catalog data only). */
export function LibraryView() {
  const { t } = useTranslation();
  const catalog = useSession((s) => s.catalog);
  const loadCatalog = useSession((s) => s.loadCatalog);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState('all');
  const ids = { search: useId(), unit: useId(), count: useId() };

  useEffect(() => {
    if (catalog.status === 'idle') void loadCatalog();
  }, [catalog.status, loadCatalog]);

  const units = useMemo(
    () =>
      [...new Map(catalog.items.map((e) => [e.unitNumber, e.unitTitleKey])).entries()].sort(
        (a, b) => a[0] - b[0],
      ),
    [catalog.items],
  );
  const needle = query.trim().toLocaleLowerCase();
  const visible = catalog.items.filter((e) => {
    const matchesUnit = unit === 'all' || String(e.unitNumber) === unit;
    const text = `${e.experimentNumber} ${t(e.titleKey)} ${t('ui.card.experiment_number', {
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
                {t(titleKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {catalog.status === 'ready' && (
        <p id={ids.count} className="result-count" aria-live="polite">
          {t('ui.library.result_count', { count: visible.length, total: catalog.items.length })}
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
      {catalog.status === 'ready' && catalog.items.length > 0 && visible.length === 0 && (
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
      {visible.length > 0 && (
        <div className="library-list">
          {visible.map((entry) => (
            <ExperimentCard key={entry.experimentId} entry={entry} />
          ))}
        </div>
      )}
      <p className="hint-text library-note">{t('ui.library.hidden_note')}</p>
    </section>
  );
}
