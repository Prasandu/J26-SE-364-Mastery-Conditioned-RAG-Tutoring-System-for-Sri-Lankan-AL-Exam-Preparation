import type { AdminDraftStatus, AdminDraftSummary, AdminReviewAction } from '@vlab/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';

const STATUSES: AdminDraftStatus[] = ['draft', 'needs_review', 'content_approved', 'archived'];

export function StatusBadge({ status }: { status: AdminDraftStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge--${status}`}>{t(`admin.status.${status}`)}</span>;
}

const open = (d: AdminDraftSummary) => d.status === 'draft' || d.status === 'needs_review';
/** No blocking issue left: can be approved now. */
export const isReady = (d: AdminDraftSummary) => open(d) && d.validation.blockingCount === 0;
const hasIssues = (d: AdminDraftSummary) => open(d) && d.validation.blockingCount > 0;

/**
 * Staged drafts (never the published student catalog) in a compact, scrollable table, with bulk
 * Quick fix (safe automatic repairs) and Approve now (drafts without blocking issues).
 */
export function DraftList({
  drafts,
  onOpen,
  client,
  onChanged,
}: {
  drafts: AdminDraftSummary[];
  onOpen: (id: string) => void;
  client?: AdminClient;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | AdminDraftStatus>('all');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
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
  const ready = drafts.filter(isReady);
  const withIssues = drafts.filter(hasIssues);

  const runAll = async (
    targets: AdminDraftSummary[],
    action: AdminReviewAction,
    doneKey: string,
  ) => {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    let ok = 0;
    let failed = 0;
    for (const d of targets) {
      try {
        await client.review(d.id, {
          expectedVersion: d.version,
          action,
          field: null,
          reviewed: null,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setMessage({
      tone: failed ? 'error' : 'success',
      text: t(doneKey, { count: ok, failed }),
    });
    onChanged?.();
  };
  const approveOne = (d: AdminDraftSummary) =>
    void runAll([d], 'quick_approve', 'admin.quick.approved_all');

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

      {client && drafts.length > 0 && (
        <div className="bulk-bar" role="group" aria-label={t('admin.quick.bulk')}>
          <p className="bulk-bar__summary">
            {t('admin.quick.summary', { ready: ready.length, issues: withIssues.length })}
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || withIssues.length === 0}
            onClick={() => {
              if (window.confirm(t('admin.quick.fix_confirm', { count: withIssues.length })))
                void runAll(withIssues, 'quick_fix', 'admin.quick.fixed_all');
            }}
          >
            <Icon name="check" size={16} /> {t('admin.quick.fix_all', { count: withIssues.length })}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || ready.length === 0}
            onClick={() => {
              if (window.confirm(t('admin.quick.approve_confirm', { count: ready.length })))
                void runAll(ready, 'quick_approve', 'admin.quick.approved_all');
            }}
          >
            {t('admin.quick.approve_all', { count: ready.length })}
          </button>
        </div>
      )}
      {busy && <StatusMessage tone="loading" title={t('admin.quick.working')} />}
      {message && <StatusMessage tone={message.tone} title={message.text} />}

      {drafts.length === 0 ? (
        <StatusMessage tone="empty" title={t('admin.drafts.empty')} />
      ) : visible.length === 0 ? (
        <StatusMessage tone="empty" title={t('admin.drafts.no_match')} />
      ) : (
        <div className="table-scroll card admin-table-scroll">
          <table className="report-table admin-table admin-table--compact">
            <thead>
              <tr>
                <th scope="col">{t('admin.col.number')}</th>
                <th scope="col">{t('admin.col.title')}</th>
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
                  <td>
                    <span className="admin-table__title">
                      {d.title ?? t('admin.missing_value')}
                    </span>
                    <span className="admin-table__note">
                      {d.syllabusUnit ?? '—'} · {d.documentName}
                    </span>
                  </td>
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
                  <td className="admin-table__actions">
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
                    {client && isReady(d) && (
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={busy}
                        aria-label={t('admin.quick.approve_label', {
                          title: d.title ?? t('admin.missing_value'),
                        })}
                        onClick={() => approveOne(d)}
                      >
                        {t('admin.quick.approve')}
                      </button>
                    )}
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
