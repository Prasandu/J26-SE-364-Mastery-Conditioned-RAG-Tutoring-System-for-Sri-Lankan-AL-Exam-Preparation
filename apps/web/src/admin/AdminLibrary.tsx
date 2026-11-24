import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { AdminRecordFilters } from './AdminRecordFilters';
import { useAdminData } from './useAdminData';

const BLOCKER = /^(missing|provenance|duplicate):/;

/**
 * Practical library overview: published (runnable) practicals and every live draft, with the
 * readiness facts the server reports. Drafts never become runnable here: that needs a validated
 * deterministic simulation definition.
 */
export function AdminLibrary({
  client,
  onOpen,
}: {
  client: AdminClient;
  onOpen: (draftId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const load = useCallback(() => client.library(), [client]);
  const { state } = useAdminData(load);

  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;

  const { entries } = state.data;
  const needle = query.trim().toLocaleLowerCase();
  const visible = entries.filter(
    (entry) =>
      (status === 'all' || entry.status === status) &&
      `${entry.experimentNumber ?? ''} ${entry.title}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <section className="section admin-records" aria-labelledby="library-admin-title">
      <h2 id="library-admin-title">{t('admin.library.title')}</h2>
      <p className="notice">{t('admin.library.rule')}</p>
      <AdminRecordFilters
        query={query}
        onQuery={setQuery}
        status={status}
        onStatus={setStatus}
        options={['published', 'draft', 'needs_review', 'content_approved'].map((value) => ({
          value,
          label: t(`admin.library.status.${value}`),
        }))}
        searchLabel={t('admin.library.search')}
        regionLabel={t('admin.library.search_region')}
        shown={visible.length}
        total={entries.length}
      />
      {entries.length === 0 ? (
        <p className="hint-text">{t('admin.library.empty')}</p>
      ) : visible.length === 0 ? (
        <StatusMessage tone="empty" title={t('admin.records.no_match')} />
      ) : (
        <div className="table-scroll card admin-table-scroll">
          <table className="report-table admin-table" role="table">
            <caption className="visually-hidden">{t('admin.library.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.library.col.number')}</th>
                <th scope="col">{t('admin.library.col.practical')}</th>
                <th scope="col">{t('admin.library.col.status')}</th>
                <th scope="col">{t('admin.library.col.students')}</th>
                <th scope="col">{t('admin.library.col.knowledge')}</th>
                <th scope="col">{t('admin.library.col.sinhala')}</th>
                <th scope="col">{t('admin.library.col.next')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const blockers = e.blockers.filter((b) => BLOCKER.test(b));
                return (
                  <tr key={`${e.kind}-${e.id}`}>
                    <td data-label={t('admin.library.col.number')}>{e.experimentNumber ?? '—'}</td>
                    <th scope="row" className="admin-records__title">
                      <span className="admin-table__title">
                        {e.title || t('admin.missing_value')}
                      </span>
                      <span className="admin-table__note">{t(`admin.records.kind.${e.kind}`)}</span>
                    </th>
                    <td data-label={t('admin.library.col.status')}>
                      <span
                        className={
                          e.kind === 'published' ? 'badge badge--ok' : `badge badge--${e.status}`
                        }
                      >
                        {t(`admin.library.status.${e.status}`)}
                      </span>
                    </td>
                    <td data-label={t('admin.library.col.students')}>
                      {e.runnable ? (
                        <span className="badge badge--ok">{t('admin.library.runnable')}</span>
                      ) : (
                        <span className="badge badge--muted">
                          {t('admin.library.not_runnable')}
                        </span>
                      )}
                    </td>
                    <td data-label={t('admin.library.col.knowledge')}>
                      {e.knowledgeChunks > 0
                        ? t('admin.library.chunks', { count: e.knowledgeChunks })
                        : t('admin.library.no_chunks')}
                    </td>
                    <td data-label={t('admin.library.col.sinhala')}>
                      {t(`admin.library.sinhala.${e.sinhala}`, { defaultValue: e.sinhala })}
                    </td>
                    <td className="admin-records__actions" data-label={t('admin.library.col.next')}>
                      {e.kind === 'draft' ? (
                        <>
                          <p className="admin-table__note">
                            {blockers.length > 0
                              ? t('admin.library.blocked', { count: blockers.length })
                              : e.status === 'content_approved'
                                ? t('admin.library.next_simulation')
                                : t('admin.library.next_review')}
                          </p>
                          <button
                            type="button"
                            className="button button--primary"
                            onClick={() => onOpen(e.id)}
                            aria-label={t('admin.drafts.open_label', {
                              title: e.title || t('admin.missing_value'),
                            })}
                          >
                            {t('admin.drafts.open')}
                          </button>
                        </>
                      ) : (
                        <span className="hint-text">
                          {e.runnable ? t('admin.library.live') : t('admin.library.not_runnable')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
