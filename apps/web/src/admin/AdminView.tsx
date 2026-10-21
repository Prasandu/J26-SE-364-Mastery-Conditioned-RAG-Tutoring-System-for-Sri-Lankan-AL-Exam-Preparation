import type { AdminDraftSummary, AdminStatus } from '@vlab/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useAdmin } from './AdminContext';
import { AdminKnowledge } from './AdminKnowledge';
import { AdminLibrary } from './AdminLibrary';
import { AdminOverview } from './AdminOverview';
import { AdminNavigation } from './AdminNavigation';
import { AdminAudit, AdminDocuments, AdminSettingsView, AdminTranslations } from './AdminSystem';
import { AdminUsers } from './AdminUsers';
import { DraftList } from './DraftList';
import { DraftReview } from './DraftReview';
import { ImportPanel } from './ImportPanel';

export type AdminSection =
  | 'overview'
  | 'library'
  | 'import'
  | 'drafts'
  | 'review'
  | 'knowledge'
  | 'users'
  | 'translations'
  | 'audit'
  | 'settings';

/**
 * Development-only administration console (no login yet; local requests only). Practical drafts,
 * imports, the knowledge base, users, translations, audit and settings. Nothing here publishes a
 * practical to students or makes one runnable.
 */
export default function AdminView() {
  const { t } = useTranslation();
  const { client } = useAdmin();
  const [section, setSection] = useState<AdminSection>('overview');
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [drafts, setDrafts] = useState<AdminDraftSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>(
    client ? 'loading' : 'unavailable',
  );

  const refresh = useCallback(async () => {
    if (!client) {
      setState('unavailable');
      return;
    }
    try {
      const [s, d] = await Promise.all([client.status(), client.drafts()]);
      setStatus(s);
      setDrafts(d);
      setState('ready');
    } catch {
      setState('unavailable');
    }
  }, [client]);

  useEffect(() => {
    if (!client) return undefined;
    let active = true;
    Promise.all([client.status(), client.drafts()]).then(
      ([s, d]) => {
        if (!active) return;
        setStatus(s);
        setDrafts(d);
        setState('ready');
      },
      () => active && setState('unavailable'),
    );
    return () => {
      active = false;
    };
  }, [client]);

  // The shared header wraps in Sinhala and on phones; sticky offsets must follow its real height.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.app-header');
    const main = document.getElementById('main');
    if (!header || !main) return;
    const update = () =>
      main.style.setProperty('--admin-header-h', `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      main.style.removeProperty('--admin-header-h');
    };
  }, []);

  const open = (id: string) => {
    setSelected(id);
    setSection('review');
  };

  return (
    <section className="view view--admin" aria-labelledby="admin-title">
      <PageHeader
        id="admin-title"
        eyebrow={
          <button
            id="admin-environment-toggle"
            type="button"
            className="button admin-environment-toggle"
            aria-expanded={environmentOpen}
            aria-controls="admin-environment-info"
            onClick={() => setEnvironmentOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEnvironmentOpen(false);
            }}
          >
            <Icon name="shield" size={14} /> {t('admin.environment.label')}
          </button>
        }
        title={t('admin.title')}
        lead={t('admin.lead')}
      >
        <section
          id="admin-environment-info"
          className="card admin-environment-info"
          aria-labelledby="admin-environment-toggle"
          hidden={!environmentOpen}
        >
          <ul>
            {['local', 'approval', 'simulation', 'production'].map((item) => (
              <li key={item}>{t(`admin.environment.${item}`)}</li>
            ))}
          </ul>
        </section>
      </PageHeader>

      {state === 'loading' && <StatusMessage tone="loading" title={t('admin.loading')} />}
      {state === 'unavailable' && (
        <StatusMessage tone="info" title={t('admin.unavailable_title')}>
          <p>{t('admin.unavailable_text')}</p>
        </StatusMessage>
      )}

      {state === 'ready' && client && status && (
        <div className="admin-console">
          <AdminNavigation
            section={section}
            canReview={selected !== null}
            onNavigate={setSection}
          />
          <div
            id="admin-content"
            className="admin-console__main"
            tabIndex={-1}
            onFocusCapture={(event) => {
              const field = event.target;
              if (!field.matches('input:not([type="file"]), textarea, select, button, summary'))
                return;
              const bounds = field.getBoundingClientRect();
              const headerBottom =
                document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
              if (
                bounds.top < headerBottom ||
                bounds.bottom > window.innerHeight ||
                bounds.left < 0 ||
                bounds.right > window.innerWidth
              ) {
                field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
            }}
          >
            {section === 'overview' && <AdminOverview status={status} onNavigate={setSection} />}
            {section === 'library' && <AdminLibrary client={client} onOpen={open} />}
            {section === 'import' && (
              <>
                <ImportPanel
                  client={client}
                  status={status}
                  onImported={() => void refresh()}
                  onOpen={open}
                />
                <AdminDocuments client={client} />
              </>
            )}
            {section === 'drafts' && (
              <DraftList
                drafts={drafts}
                onOpen={open}
                client={client}
                onChanged={() => void refresh()}
              />
            )}
            {section === 'review' && selected && (
              <DraftReview
                key={selected}
                client={client}
                draftId={selected}
                onChanged={() => void refresh()}
              />
            )}
            {section === 'knowledge' && (
              <AdminKnowledge client={client} drafts={drafts} onChanged={() => void refresh()} />
            )}
            {section === 'users' && <AdminUsers client={client} />}
            {section === 'translations' && <AdminTranslations client={client} />}
            {section === 'audit' && <AdminAudit client={client} />}
            {section === 'settings' && <AdminSettingsView client={client} />}
          </div>
        </div>
      )}
    </section>
  );
}
