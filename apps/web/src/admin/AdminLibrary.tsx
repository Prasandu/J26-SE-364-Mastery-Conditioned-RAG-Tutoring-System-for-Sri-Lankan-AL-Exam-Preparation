import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
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
  const load = useCallback(() => client.library(), [client]);
  const { state } = useAdminData(load);

  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;

  const { entries } = state.data;
  return (
    <section className="section" aria-labelledby="library-admin-title">
      <h2 id="library-admin-title">{t('admin.library.title')}</h2>
      <p className="hint-text">{t('admin.library.rule')}</p>
      {entries.length === 0 ? (
        <p className="hint-text">{t('admin.library.empty')}</p>
      ) : (
        <div className="table-scroll card">
          <table className="report-table admin-table">
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
              {entries.map((e) => {
                const blockers = e.blockers.filter((b) => BLOCKER.test(b));
                return (
                  <tr key={`${e.kind}-${e.id}`}>
                    <td>{e.experimentNumber ?? '—'}</td>
                    <th scope="row">{e.title || t('admin.missing_value')}</th>
                    <td>
                      <span
                        className={
                          e.kind === 'published' ? 'badge badge--ok' : `badge badge--${e.status}`
                        }
                      >
                        {t(`admin.library.status.${e.status}`)}
                      </span>
                    </td>
                    <td>
                      {e.runnable ? (
                        <span className="badge badge--ok">{t('admin.library.runnable')}</span>
                      ) : (
                        <span className="badge badge--muted">
                          {t('admin.library.not_runnable')}
                        </span>
                      )}
                    </td>
                    <td>
                      {e.knowledgeChunks > 0
                        ? t('admin.library.chunks', { count: e.knowledgeChunks })
                        : t('admin.library.no_chunks')}
                    </td>
                    <td>{t(`admin.library.sinhala.${e.sinhala}`, { defaultValue: e.sinhala })}</td>
                    <td>
                      {e.kind === 'draft' ? (
                        <>
                          <p className="admin-table__note">
                            {blockers.length > 0
                              ? t('admin.library.blocked', { count: blockers.length })
                              : e.status === 'content_approved'
                                ? t('admin.library.next_simulation')
                                : t('admin.library.next_review')}
                          </p>
                          <button type="button" className="button" onClick={() => onOpen(e.id)}>
                            {t('admin.library.open')}
                          </button>
                        </>
                      ) : (
                        <span className="hint-text">{t('admin.library.live')}</span>
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
