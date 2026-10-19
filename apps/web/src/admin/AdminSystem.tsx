import type { AdminDocuments } from '@vlab/contracts';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { errorKey, useAdminData } from './useAdminData';

const ERRORS = new Set(['draft_version_conflict', 'invalid_request', 'network_unavailable']);

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
    <section className="section" aria-labelledby="docs-title">
      <h2 id="docs-title">{t('admin.docs.title')}</h2>
      <p className="hint-text">{t('admin.docs.lead')}</p>
      {message && <StatusMessage tone={message.tone} title={t(message.key)} />}
      {state.data.length === 0 ? (
        <p className="hint-text">{t('admin.docs.empty')}</p>
      ) : (
        <div className="table-scroll card">
          <table className="report-table admin-table">
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
                  <th scope="row">
                    {d.documentName}
                    <span className="admin-table__note admin-table__mono">
                      {d.sourceSha256.slice(0, 12)}… · {d.importedAt.slice(0, 10)}
                    </span>
                  </th>
                  <td>{d.pageCount}</td>
                  <td>{d.drafts}</td>
                  <td>
                    <span className={d.fileOk ? 'badge badge--ok' : 'badge badge--warning'}>
                      {t(d.fileOk ? 'admin.docs.file_ok' : 'admin.docs.file_missing')}
                    </span>
                  </td>
                  <td>
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
    <section className="section" aria-labelledby="tr-title">
      <h2 id="tr-title">{t('admin.tr.title')}</h2>
      <p className="hint-text">{t('admin.tr.lead')}</p>
      <div className="table-scroll card">
        <table className="report-table admin-table">
          <caption className="visually-hidden">{t('admin.tr.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('admin.tr.file')}</th>
              <th scope="col">{t('admin.tr.coverage')}</th>
              <th scope="col">{t('admin.tr.status')}</th>
              <th scope="col">{t('admin.tr.sheet')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((f) => (
              <tr key={f.file}>
                <th scope="row">{f.file}</th>
                <td>{t('admin.tr.counts', { translated: f.translated, keys: f.keys })}</td>
                <td>
                  <span
                    className={f.status === 'reviewed' ? 'badge badge--ok' : 'badge badge--warning'}
                  >
                    {t(`admin.tr.state.${f.status}`)}
                  </span>
                  {f.reviewer && <span className="admin-table__note">{f.reviewer}</span>}
                </td>
                <td>
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
    <section className="section" aria-labelledby="audit-title">
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
        <div className="table-scroll card">
          <table className="report-table admin-table">
            <caption className="visually-hidden">{t('admin.audit.title')}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t('admin.audit.when')}</th>
                <th scope="col">{t('admin.audit.action')}</th>
                <th scope="col">{t('admin.audit.target')}</th>
                <th scope="col">{t('admin.audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.seq}>
                  <td>{e.seq}</td>
                  <td>{time.format(new Date(e.at))}</td>
                  <th scope="row" className="admin-table__mono">
                    {e.action}
                  </th>
                  <td className="admin-table__mono">
                    {e.targetKind ?? '—'}
                    {e.targetId && ` ${e.targetId.slice(0, 8)}…`}
                  </td>
                  <td className="admin-table__mono admin-table__details">
                    {Object.entries(e.details)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ') || '—'}
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
    ['admin.settings.ollama', `${s.generation.ollamaModel ?? '—'} · ${s.ollamaBaseUrl}`],
    ['admin.settings.assist', s.extractionAssist],
    ['admin.settings.login', yes(s.loginEnabled)],
  ];
  return (
    <section className="section" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('admin.settings.title')}</h2>
      <p className="hint-text">{t('admin.settings.lead')}</p>
      <dl className="facts admin-settings">
        {rows.map(([key, value]) => (
          <div key={key} className="admin-settings__row">
            <dt>{t(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
