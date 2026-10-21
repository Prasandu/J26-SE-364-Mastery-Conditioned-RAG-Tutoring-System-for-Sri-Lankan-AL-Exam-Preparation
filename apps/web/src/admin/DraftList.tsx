import type { AdminDraftStatus, AdminDraftSummary, AdminReviewAction } from '@vlab/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { useFeedback } from '../components/ui/Feedback';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { AdminRecordFilters } from './AdminRecordFilters';

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
  const { confirm, toast } = useFeedback();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | AdminDraftStatus>('all');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const visible = drafts.filter(
    (d) =>
      (status === 'all' || d.status === status) &&
      (needle === '' ||
        `${d.experimentNumber ?? ''} ${d.title ?? ''} ${d.documentName} ${d.syllabusUnit ?? ''}`
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
    const text = t(doneKey, { count: ok, failed });
    setMessage({ tone: failed ? 'error' : 'success', text });
    // The bulk bar can scroll out of view on a long list, so the outcome is also announced.
    toast(text, failed ? 'error' : 'success');
    onChanged?.();
  };
  const approveOne = (d: AdminDraftSummary) =>
    void runAll([d], 'quick_approve', 'admin.quick.approved_all');

  return (
    <section aria-labelledby="draft-list-title" className="section admin-records">
      <h2 id="draft-list-title">{t('admin.drafts.title')}</h2>
      <p className="notice">{t('admin.drafts.rule')}</p>
      <AdminRecordFilters
        query={query}
        onQuery={setQuery}
        status={status}
        onStatus={(value) => setStatus(value as 'all' | AdminDraftStatus)}
        options={STATUSES.map((value) => ({ value, label: t(`admin.status.${value}`) }))}
        searchLabel={t('admin.drafts.search')}
        regionLabel={t('admin.drafts.search_region')}
        shown={visible.length}
        total={drafts.length}
      />

      {client && drafts.length > 0 && (
        <div className="bulk-bar" role="group" aria-label={t('admin.quick.bulk')}>
          <p className="bulk-bar__summary">
            {t('admin.quick.summary', { ready: ready.length, issues: withIssues.length })}
            <span className="admin-table__note">{t('admin.drafts.bulk_scope')}</span>
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || withIssues.length === 0}
            onClick={() => {
              void (async () => {
                const ok = await confirm(
                  t('admin.quick.fix_confirm', { count: withIssues.length }),
                );
                if (ok) await runAll(withIssues, 'quick_fix', 'admin.quick.fixed_all');
              })();
            }}
          >
            <Icon name="check" size={16} /> {t('admin.quick.fix_all', { count: withIssues.length })}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || ready.length === 0}
            onClick={() => {
              void (async () => {
                // Approving a batch cannot be undone from here, so it keeps a real gate.
                const ok = await confirm(
                  t('admin.quick.approve_confirm', { count: ready.length }),
                  {
                    destructive: true,
                  },
                );
                if (ok) await runAll(ready, 'quick_approve', 'admin.quick.approved_all');
              })();
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
          <table className="report-table admin-table admin-table--compact" role="table">
            <caption className="visually-hidden">{t('admin.drafts.title')}</caption>
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
                  <td data-label={t('admin.col.number')}>{d.experimentNumber ?? '—'}</td>
                  <th scope="row" className="admin-records__title">
                    <span className="admin-table__title">
                      {d.title ?? t('admin.missing_value')}
                    </span>
                    <span className="admin-table__note">{d.syllabusUnit ?? '—'}</span>
                    <span className="admin-table__note">{d.documentName}</span>
                  </th>
                  <td data-label={t('admin.col.status')}>
                    <StatusBadge status={d.status} />
                  </td>
                  <td data-label={t('admin.col.validation')}>
                    {d.validation.blockingCount === 0 ? (
                      <span className="badge badge--ok">{t('admin.validation.ok')}</span>
                    ) : (
                      <span className="badge badge--warning">
                        {t('admin.validation.blocking', { count: d.validation.blockingCount })}
                      </span>
                    )}
                  </td>
                  <td data-label={t('admin.col.simulation')}>
                    <span className="badge badge--muted">{t('admin.simulation.pending')}</span>
                    <span className="admin-table__note">{t('admin.library.not_runnable')}</span>
                  </td>
                  <td className="admin-records__actions" data-label={t('admin.col.actions')}>
                    <div className="admin-table__actions">
                      <button
                        type="button"
                        className="button button--primary"
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
                          className="button"
                          disabled={busy}
                          aria-label={t('admin.quick.approve_label', {
                            title: d.title ?? t('admin.missing_value'),
                          })}
                          onClick={() => approveOne(d)}
                        >
                          {t('admin.quick.approve')}
                        </button>
                      )}
                    </div>
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
