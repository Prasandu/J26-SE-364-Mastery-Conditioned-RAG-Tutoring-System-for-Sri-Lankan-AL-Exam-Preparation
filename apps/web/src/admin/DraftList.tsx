import type { AdminDraftStatus, AdminDraftSummary } from '@vlab/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';

const STATUSES: AdminDraftStatus[] = ['draft', 'needs_review', 'content_approved', 'archived'];

export function StatusBadge({ status }: { status: AdminDraftStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge--${status}`}>{t(`admin.status.${status}`)}</span>;
}

/** Searchable, filterable list of staged drafts (never the published student catalog). */
export function DraftList({
  drafts,
  onOpen,
}: {
  drafts: AdminDraftSummary[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | AdminDraftStatus>('all');
  const ids = { search: useId(), status: useId() };
  const needle = query.trim().toLocaleLowerCase();
  const visible = drafts.filter(
    (d) =>
      (status === 'all' || d.status === status) &&
      (needle === '' ||
        `${d.experimentNumber ?? ''} ${d.title ?? ''} ${d.documentName}`
          .toLocaleLowerCase()
          .includes(needle)),
  );

  return (
    <section aria-labelledby="draft-list-title" className="section">
      <h2 id="draft-list-title">{t('admin.drafts.title')}</h2>
      <div className="toolbar" role="search" aria-label={t('admin.drafts.search_region')}>
        <div className="toolbar__field toolbar__field--grow">
          <label htmlFor={ids.search}>{t('admin.drafts.search')}</label>
          <div className="input-icon">
            <Icon name="search" size={18} />
            <input
              id={ids.search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar__field">
          <label htmlFor={ids.status}>{t('admin.drafts.status_filter')}</label>
          <select
            id={ids.status}
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | AdminDraftStatus)}
          >
            <option value="all">{t('admin.drafts.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {drafts.length === 0 ? (
        <StatusMessage tone="empty" title={t('admin.drafts.empty')} />
      ) : visible.length === 0 ? (
        <StatusMessage tone="empty" title={t('admin.drafts.no_match')} />
      ) : (
        <div className="table-scroll card">
          <table className="report-table admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.col.number')}</th>
                <th scope="col">{t('admin.col.title')}</th>
                <th scope="col">{t('admin.col.unit')}</th>
                <th scope="col">{t('admin.col.source')}</th>
                <th scope="col">{t('admin.col.status')}</th>
                <th scope="col">{t('admin.col.validation')}</th>
                <th scope="col">{t('admin.col.simulation')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('admin.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td>{d.experimentNumber ?? '—'}</td>
                  <td>{d.title ?? t('admin.missing_value')}</td>
                  <td>{d.syllabusUnit ?? '—'}</td>
                  <td>{d.documentName}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    {d.validation.blockingCount === 0 ? (
                      <span className="badge badge--ok">{t('admin.validation.ok')}</span>
                    ) : (
                      <span className="badge badge--warning">
                        {t('admin.validation.blocking', { count: d.validation.blockingCount })}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge--muted">{t('admin.simulation.pending')}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      onClick={() => onOpen(d.id)}
                      aria-label={t('admin.drafts.open_label', {
                        title: d.title ?? t('admin.missing_value'),
                      })}
                    >
                      {t('admin.drafts.open')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
