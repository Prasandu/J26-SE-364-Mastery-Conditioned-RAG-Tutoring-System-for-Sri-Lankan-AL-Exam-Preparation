import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';

export function AdminRecordFilters({
  query,
  onQuery,
  status,
  onStatus,
  options,
  searchLabel,
  regionLabel,
  shown,
  total,
}: {
  query: string;
  onQuery: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  options: { value: string; label: string }[];
  searchLabel: string;
  regionLabel: string;
  shown: number;
  total: number;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <div className="toolbar admin-records__filters" role="search" aria-label={regionLabel}>
        <div className="toolbar__field toolbar__field--grow">
          <label htmlFor={`${id}-search`}>{searchLabel}</label>
          <div className="input-icon">
            <Icon name="search" size={18} />
            <input
              id={`${id}-search`}
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="toolbar__field">
          <label htmlFor={`${id}-status`}>{t('admin.drafts.status_filter')}</label>
          <select
            id={`${id}-status`}
            value={status}
            onChange={(event) => onStatus(event.target.value)}
          >
            <option value="all">{t('admin.drafts.all')}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button"
          disabled={!query && status === 'all'}
          onClick={() => {
            onQuery('');
            onStatus('all');
          }}
        >
          {t('admin.records.clear')}
        </button>
      </div>
      <p className="result-count" role="status" aria-live="polite" aria-atomic="true">
        {t('admin.records.results', { shown, total })}
      </p>
    </>
  );
}
