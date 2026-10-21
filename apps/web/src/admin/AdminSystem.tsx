import type { AdminDocuments } from '@vlab/contracts';
import { Fragment, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { errorKey, useAdminData } from './useAdminData';

const ERRORS = new Set(['draft_version_conflict', 'invalid_request', 'network_unavailable']);

/** Display only the endpoint origin; credentials, paths, queries and fragments are private. */
const endpointOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
};

/** Source document register: every imported PDF, its checksum state and a licence note. */
export function AdminDocuments({ client }: { client: AdminClient }) {
  const { t } = useTranslation();
  const load = useCallback(() => client.documents(), [client]);
  const { state, reload } = useAdminData(load);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; key: string } | null>(null);

  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;
  const save = async (doc: AdminDocuments[number]) => {
    setMessage(null);
    try {
      await client.updateDocument(doc.importId, {
        expectedVersion: doc.version,
        licenceNote: notes[doc.importId] ?? doc.licenceNote,
      });
      setMessage({ tone: 'success', key: 'admin.docs.saved' });
      reload();
    } catch (error) {
      setMessage({ tone: 'error', key: errorKey(error, ERRORS) });
    }
  };
  return (
    <section className="section admin-records" aria-labelledby="docs-title">
      <h2 id="docs-title">{t('admin.docs.title')}</h2>
      <p className="hint-text">{t('admin.docs.lead')}</p>
      {message && <StatusMessage tone={message.tone} title={t(message.key)} />}
      {state.data.length === 0 ? (
        <p className="hint-text">{t('admin.docs.empty')}</p>
      ) : (
        <div className="table-scroll card admin-table-scroll">
          <table className="report-table admin-table" role="table">
            <caption className="visually-hidden">{t('admin.docs.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.docs.name')}</th>
                <th scope="col">{t('admin.docs.pages')}</th>
                <th scope="col">{t('admin.docs.drafts')}</th>
                <th scope="col">{t('admin.docs.file')}</th>
                <th scope="col">{t('admin.docs.licence')}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((d) => (
                <tr key={d.importId}>
                  <th scope="row" className="admin-records__title">
                    {d.documentName}
                    <span className="admin-table__note admin-table__mono">
                      {d.sourceSha256.slice(0, 12)}… · {d.importedAt.slice(0, 10)}
                    </span>
                  </th>
                  <td data-label={t('admin.docs.pages')}>{d.pageCount}</td>
                  <td data-label={t('admin.docs.drafts')}>{d.drafts}</td>
                  <td data-label={t('admin.docs.file')}>
                    <span className={d.fileOk ? 'badge badge--ok' : 'badge badge--warning'}>
                      {t(d.fileOk ? 'admin.docs.file_ok' : 'admin.docs.file_missing')}
                    </span>
                  </td>
                  <td className="admin-records__actions" data-label={t('admin.docs.licence')}>
                    <label className="visually-hidden" htmlFor={`lic-${d.importId}`}>
                      {t('admin.docs.licence')}
                    </label>
                    <span className="admin-inline">
                      <input
                        id={`lic-${d.importId}`}
                        type="text"
                        maxLength={500}
                        value={notes[d.importId] ?? d.licenceNote}
                        placeholder={t('admin.docs.licence_placeholder')}
                        onChange={(e) => setNotes({ ...notes, [d.importId]: e.target.value })}
                      />
                      <button type="button" className="button" onClick={() => void save(d)}>
                        {t('admin.docs.save')}
                      </button>
                    </span>
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

/** Sinhala translation status per locale file, with a review sheet for a qualified teacher. */
export function AdminTranslations({ client }: { client: AdminClient }) {
  const { t } = useTranslation();
  const load = useCallback(() => client.translations(), [client]);
  const { state } = useAdminData(load);
  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;
  return (
    <section className="section admin-records admin-translations" aria-labelledby="tr-title">
      <h2 id="tr-title">{t('admin.tr.title')}</h2>
      <p className="hint-text">{t('admin.tr.lead')}</p>
      <p className="notice">{t('admin.tr.coverage_help')}</p>
      <div className="table-scroll card admin-table-scroll">
        <table className="report-table admin-table" role="table">
          <caption className="visually-hidden">{t('admin.tr.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('admin.tr.file')}</th>
              <th scope="col">{t('admin.tr.coverage')}</th>
              <th scope="col">{t('admin.tr.approval')}</th>
              <th scope="col">{t('admin.tr.sheet')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((f) => (
              <tr key={f.file}>
                <th scope="row" className="admin-records__title">
                  {f.file}
                </th>
                <td data-label={t('admin.tr.coverage')}>
                  <p className="admin-coverage__count">
                    {t('admin.tr.counts', { translated: f.translated, keys: f.keys })}
                  </p>
                  <progress
                    className="admin-coverage"
                    aria-label={t('admin.tr.coverage_label', { file: f.file })}
                    value={Math.min(f.translated, f.keys)}
                    max={Math.max(f.keys, 1)}
                  />
                </td>
                <td data-label={t('admin.tr.approval')}>
                  <span
                    className={f.status === 'reviewed' ? 'badge badge--ok' : 'badge badge--warning'}
                  >
                    {t(`admin.tr.state.${f.status}`)}
                  </span>
                  {f.reviewer && (
                    <span className="admin-table__note">
                      {t('admin.tr.reviewer', { name: f.reviewer })}
                    </span>
                  )}
                  {f.reviewedOn && (
                    <time className="admin-table__note" dateTime={f.reviewedOn}>
                      {f.reviewedOn}
                    </time>
                  )}
                </td>
                <td className="admin-records__actions" data-label={t('admin.tr.sheet')}>
                  <a className="button" href={client.translationSheetUrl(f.file)} download>
                    {t('admin.tr.download')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Append-only audit log with its hash-chain verification. */
export function AdminAudit({ client }: { client: AdminClient }) {
  const { t, i18n } = useTranslation();
  const load = useCallback(() => client.audit(), [client]);
  const { state } = useAdminData(load);
  const [expanded, setExpanded] = useState<number[]>([]);
  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;
  const { events, chainOk } = state.data;
  const time = new Intl.DateTimeFormat(i18n.language === 'si' ? 'si-LK' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <section className="section admin-records admin-audit" aria-labelledby="audit-title">
      <h2 id="audit-title">{t('admin.audit.title')}</h2>
      <p>
        <span className={chainOk ? 'badge badge--ok' : 'badge badge--warning'}>
          {t(chainOk ? 'admin.audit.chain_ok' : 'admin.audit.chain_broken')}
        </span>{' '}
        <span className="hint-text">{t('admin.audit.lead')}</span>
      </p>
      {events.length === 0 ? (
        <p className="hint-text">{t('admin.audit.empty')}</p>
      ) : (
        <div className="table-scroll card admin-table-scroll">
          <table className="report-table admin-table" role="table">
            <caption className="visually-hidden">{t('admin.audit.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.audit.sequence')}</th>
                <th scope="col">{t('admin.audit.when')}</th>
                <th scope="col">{t('admin.audit.action')}</th>
                <th scope="col">{t('admin.audit.target')}</th>
                <th scope="col">{t('admin.audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <Fragment key={e.seq}>
                  <tr>
                    <td data-label={t('admin.audit.sequence')}>{e.seq}</td>
                    <td data-label={t('admin.audit.when')}>
                      <time dateTime={e.at} title={e.at}>
                        {time.format(new Date(e.at))}
                      </time>
                    </td>
                    <th scope="row" className="admin-records__title">
                      <span className="admin-table__title">
                        {t(`admin.audit.event.${e.action}`, { defaultValue: e.action })}
                      </span>
                      <code className="admin-table__note admin-table__mono">{e.action}</code>
                    </th>
                    <td className="admin-table__mono" data-label={t('admin.audit.target')}>
                      {e.targetKind ?? '—'}
                      {e.targetId && (
                        <span className="admin-table__note admin-table__mono">{e.targetId}</span>
                      )}
                    </td>
                    <td className="admin-records__actions" data-label={t('admin.audit.details')}>
                      <button
                        type="button"
                        className="button button--ghost"
                        aria-expanded={expanded.includes(e.seq)}
                        aria-controls={`audit-record-${e.seq}`}
                        onClick={() =>
                          setExpanded((current) =>
                            current.includes(e.seq)
                              ? current.filter((seq) => seq !== e.seq)
                              : [...current, e.seq],
                          )
                        }
                      >
                        {t('admin.audit.exact_record')}
                      </button>
                    </td>
                  </tr>
                  {expanded.includes(e.seq) && (
                    <tr className="admin-audit__expanded">
                      <td colSpan={5} className="admin-records__actions">
                        <pre
                          id={`audit-record-${e.seq}`}
                          tabIndex={0}
                          aria-label={t('admin.audit.exact_record')}
                        >
                          {JSON.stringify(e, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Read-only view of the server configuration (no secrets are ever returned). */
export function AdminSettingsView({ client }: { client: AdminClient }) {
  const { t } = useTranslation();
  const load = useCallback(() => client.settings(), [client]);
  const { state } = useAdminData(load);
  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;
  const s = state.data;
  const yes = (v: boolean) => t(v ? 'admin.settings.yes' : 'admin.settings.no');
  const rows: [string, string][] = [
    ['admin.settings.environment', s.environment],
    ['admin.settings.admin_store', t(`admin.settings.store.${s.adminRepository}`)],
    ['admin.settings.knowledge_store', t(`admin.kb.repository.${s.knowledgeRepository}`)],
    ['admin.settings.database', yes(s.databaseConfigured)],
    ['admin.settings.embeddings', `${s.embedding.provider} · ${s.embedding.model}`],
    ['admin.settings.generation', s.generation.provider],
    [
      'admin.settings.groq',
      `${s.generation.groqModel ?? '—'} · ${yes(s.generation.groqKeyConfigured)}`,
    ],
    [
      'admin.settings.openai',
      `${s.generation.openaiModel ?? '—'} · ${yes(s.generation.openaiKeyConfigured)}`,
    ],
    [
      'admin.settings.ollama',
      `${s.generation.ollamaModel ?? '—'} · ${endpointOrigin(s.ollamaBaseUrl) ?? t('admin.settings.endpoint_hidden')}`,
    ],
    ['admin.settings.assist', s.extractionAssist],
    ['admin.settings.login', yes(s.loginEnabled)],
  ];
  const groups = [
    {
      title: 'admin.settings.runtime',
      keys: ['admin.settings.environment', 'admin.settings.login'],
    },
    {
      title: 'admin.settings.storage',
      keys: [
        'admin.settings.admin_store',
        'admin.settings.knowledge_store',
        'admin.settings.database',
      ],
    },
    {
      title: 'admin.settings.models',
      keys: [
        'admin.settings.embeddings',
        'admin.settings.generation',
        'admin.settings.groq',
        'admin.settings.openai',
        'admin.settings.ollama',
        'admin.settings.assist',
      ],
    },
  ];
  return (
    <section className="section admin-records" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('admin.settings.title')}</h2>
      <p className="notice">{t('admin.settings.lead')}</p>
      <div className="admin-settings-groups">
        {groups.map((group) => (
          <article className="card" key={group.title} aria-labelledby={group.title}>
            <h3 id={group.title} className="card__title">
              {t(group.title)}
            </h3>
            <dl className="admin-settings admin-settings--group">
              {rows
                .filter(([key]) => group.keys.includes(key))
                .map(([key, value]) => (
                  <div key={key} className="admin-settings__row">
                    <dt>{t(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
