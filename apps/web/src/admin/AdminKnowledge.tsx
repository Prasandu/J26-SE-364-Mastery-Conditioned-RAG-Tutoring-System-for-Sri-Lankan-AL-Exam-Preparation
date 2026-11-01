import type { AdminDraftSummary, AdminKnowledgeBuild, AdminKnowledgeChunks } from '@vlab/contracts';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { errorKey, useAdminData } from './useAdminData';

const ERRORS = new Set([
  'knowledge_unavailable',
  'knowledge_build_rejected',
  'embedding_model_mismatch',
  'chunking_failed',
  'nothing_to_build',
  'network_unavailable',
]);

/**
 * Knowledge base feed: build a new version from content-approved drafts (local embeddings),
 * review the automatic check, then activate it. Rollback = activate an earlier version.
 */
export function AdminKnowledge({
  client,
  drafts,
  onChanged,
}: {
  client: AdminClient;
  drafts: AdminDraftSummary[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const load = useCallback(() => client.knowledge(), [client]);
  const { state, reload, setData } = useAdminData(load);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [chunks, setChunks] = useState<{ version: string; items: AdminKnowledgeChunks } | null>(
    null,
  );

  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;
  const kb = state.data;
  const ready = drafts.filter(
    (d) => d.status === 'content_approved' && d.validation.blockingCount === 0,
  );

  const run = async (op: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await op();
    } catch (error) {
      setMessage({ tone: 'error', text: t(errorKey(error, ERRORS)) });
    } finally {
      setBusy(false);
    }
  };
  const build = () =>
    run(async () => {
      const record: AdminKnowledgeBuild = await client.buildKnowledge(selected);
      setMessage({
        tone: record.checkPassed ? 'success' : 'error',
        text: t(record.checkPassed ? 'admin.kb.built' : 'admin.kb.built_check_failed', {
          version: record.knowledgeVersion,
          count: record.newChunks,
        }),
      });
      setSelected([]);
      reload();
      onChanged();
    });
  const activate = (version: string) =>
    run(async () => {
      setData(await client.activateKnowledge(version));
      setMessage({ tone: 'success', text: t('admin.kb.activated', { version }) });
      onChanged();
    });
  const showChunks = (version: string) =>
    run(async () => setChunks({ version, items: await client.knowledgeChunks(version) }));

  return (
    <section className="section admin-kb admin-records" aria-labelledby="kb-title">
      <h2 id="kb-title">{t('admin.kb.title')}</h2>
      <p className="hint-text">{t('admin.kb.lead')}</p>
      <p className="notice">{t('admin.kb.lifecycle')}</p>
      {message && <StatusMessage tone={message.tone} title={message.text} />}

      <div className="admin-kb__summary">
        <article className="card card--accent">
          <h3 className="card__title">{t('admin.kb.active')}</h3>
          {kb.active ? (
            <>
              <p className="admin-kb__version">{kb.active.knowledgeVersion}</p>
              <p className="hint-text">
                {t('admin.kb.active_detail', {
                  count: kb.active.chunkCount,
                  model: kb.active.embeddingModel,
                })}
              </p>
            </>
          ) : (
            <p className="hint-text">{t('admin.kb.none_active')}</p>
          )}
        </article>
        <article className="card">
          <h3 className="card__title">{t('admin.kb.staged')}</h3>
          <p className="stat__value">
            {kb.builds.filter((record) => record.status === 'staged').length}
          </p>
          <p className="hint-text">{t('admin.kb.staged_help')}</p>
        </article>
        <article className="card">
          <h3 className="card__title">{t('admin.kb.engine')}</h3>
          <dl className="facts">
            <dt>{t('admin.kb.store')}</dt>
            <dd>{t(`admin.kb.repository.${kb.repository}`)}</dd>
            <dt>{t('admin.kb.embeddings')}</dt>
            <dd>
              {kb.embeddingProvider === 'disabled'
                ? t('admin.kb.embeddings_off')
                : `${kb.embeddingModel} (${kb.embeddingProvider})`}
            </dd>
          </dl>
        </article>
      </div>

      {!kb.available ? (
        <StatusMessage tone="info" title={t('admin.kb.unavailable_title')}>
          <p>{t('admin.kb.unavailable_text')}</p>
        </StatusMessage>
      ) : (
        <article className="card" aria-labelledby="kb-build-title">
          <h3 id="kb-build-title" className="card__title">
            {t('admin.kb.build_title')}
          </h3>
          {ready.length === 0 ? (
            <p className="hint-text">{t('admin.kb.no_ready')}</p>
          ) : (
            <fieldset className="checklist">
              <legend>{t('admin.kb.choose')}</legend>
              {ready.map((d) => (
                <div className="check" key={d.id}>
                  <input
                    type="checkbox"
                    id={`kb-${d.id}`}
                    checked={selected.includes(d.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id),
                      )
                    }
                  />
                  <label htmlFor={`kb-${d.id}`}>
                    {d.experimentNumber !== null &&
                      `${t('ui.card.experiment_number', { number: d.experimentNumber })}: `}
                    {d.title ?? t('admin.missing_value')}
                  </label>
                </div>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="button button--primary"
            disabled={busy || selected.length === 0}
            onClick={() => void build()}
          >
            {t('admin.kb.build')}
          </button>
          <p className="hint-text">{t('admin.kb.build_help')}</p>
        </article>
      )}

      <h3>{t('admin.kb.versions')}</h3>
      {kb.builds.length === 0 && !kb.baseVersion ? (
        <p className="hint-text">{t('admin.kb.no_versions')}</p>
      ) : (
        <div className="table-scroll card admin-table-scroll">
          <table className="report-table admin-table" role="table">
            <caption className="visually-hidden">{t('admin.kb.versions')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.kb.col.version')}</th>
                <th scope="col">{t('admin.kb.col.status')}</th>
                <th scope="col">{t('admin.kb.col.chunks')}</th>
                <th scope="col">{t('admin.kb.col.dedupe')}</th>
                <th scope="col">{t('admin.kb.col.check')}</th>
                <th scope="col">{t('admin.kb.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {kb.builds.map((b) => (
                <tr key={b.id}>
                  <th scope="row" className="admin-table__mono admin-records__title">
                    {b.knowledgeVersion}
                  </th>
                  <td data-label={t('admin.kb.col.status')}>
                    <span className={b.status === 'active' ? 'badge badge--ok' : 'badge'}>
                      {t(`admin.kb.status.${b.status}`)}
                    </span>
                  </td>
                  <td data-label={t('admin.kb.col.chunks')}>
                    {t('admin.kb.chunk_counts', {
                      total: b.chunkCount,
                      fresh: b.newChunks,
                      carried: b.carriedChunks,
                    })}
                  </td>
                  <td data-label={t('admin.kb.col.dedupe')}>
                    {t('admin.kb.dedupe_counts', { exact: b.skippedExact, near: b.skippedNear })}
                  </td>
                  <td data-label={t('admin.kb.col.check')}>
                    {b.checkPassed ? (
                      <span className="badge badge--ok">{t('admin.kb.check_ok')}</span>
                    ) : (
                      <span className="badge badge--warning">{t('admin.kb.check_failed')}</span>
                    )}
                  </td>
                  <td className="admin-records__actions" data-label={t('admin.kb.col.actions')}>
                    <div className="admin-table__actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => void showChunks(b.knowledgeVersion)}
                      >
                        {t('admin.kb.view_chunks')}
                      </button>
                      {b.status !== 'active' && (
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={busy}
                          onClick={() => void activate(b.knowledgeVersion)}
                        >
                          {t('admin.kb.activate')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {kb.baseVersion && (
                <tr>
                  <th scope="row" className="admin-table__mono admin-records__title">
                    {kb.baseVersion}
                  </th>
                  <td data-label={t('admin.kb.col.status')}>
                    <span
                      className={
                        kb.active?.knowledgeVersion === kb.baseVersion ? 'badge badge--ok' : 'badge'
                      }
                    >
                      {t(
                        kb.active?.knowledgeVersion === kb.baseVersion
                          ? 'admin.kb.status.active'
                          : 'admin.kb.status.base',
                      )}
                    </span>
                  </td>
                  <td colSpan={3} data-label={t('admin.kb.versions')}>
                    {t('admin.kb.base_note')}
                  </td>
                  <td className="admin-records__actions" data-label={t('admin.kb.col.actions')}>
                    <div className="admin-table__actions">
                      {kb.active?.knowledgeVersion !== kb.baseVersion && (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void activate(kb.baseVersion!)}
                        >
                          {t('admin.kb.rollback_base')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {chunks && (
        <article className="card" aria-labelledby="kb-chunks-title">
          <h3 id="kb-chunks-title" className="card__title">
            {t('admin.kb.chunks_title', { version: chunks.version, count: chunks.items.length })}
          </h3>
          <ol className="admin-chunks">
            {chunks.items.slice(0, 40).map((c) => (
              <li key={c.chunkId}>
                <p className="admin-chunks__head">
                  <strong>{c.heading}</strong>{' '}
                  <span className="hint-text">
                    {t('admin.kb.chunk_source', { title: c.documentTitle, page: c.pdfPage })}
                  </span>
                </p>
                <p className="admin-chunks__text">{c.text}</p>
              </li>
            ))}
          </ol>
        </article>
      )}
    </section>
  );
}
