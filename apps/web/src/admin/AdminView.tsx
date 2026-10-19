import type { AdminDraftSummary, AdminStatus } from '@vlab/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useAdmin } from './AdminContext';
import { AdminKnowledge } from './AdminKnowledge';
import { AdminLibrary } from './AdminLibrary';
import { AdminOverview } from './AdminOverview';
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

const NAV: { group: string; items: { id: AdminSection; icon: IconName }[] }[] = [
  {
    group: 'admin.group.content',
    items: [
      { id: 'overview', icon: 'layers' },
      { id: 'library', icon: 'book' },
      { id: 'import', icon: 'clipboard' },
      { id: 'drafts', icon: 'search' },
      { id: 'review', icon: 'check' },
    ],
  },
  {
    group: 'admin.group.knowledge',
    items: [
      { id: 'knowledge', icon: 'flask' },
      { id: 'translations', icon: 'globe' },
    ],
  },
  {
    group: 'admin.group.system',
    items: [
      { id: 'users', icon: 'shield' },
      { id: 'audit', icon: 'alert' },
      { id: 'settings', icon: 'compass' },
    ],
  },
];

/**
 * Development-only administration console (no login yet; local requests only). Practical drafts,
 * imports, the knowledge base, users, translations, audit and settings. Nothing here publishes a
 * practical to students or makes one runnable.
 */
export default function AdminView() {
  const { t } = useTranslation();
  const { client } = useAdmin();
  const [section, setSection] = useState<AdminSection>('overview');
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

  const open = (id: string) => {
    setSelected(id);
    setSection('review');
  };

  return (
    <section className="view view--admin" aria-labelledby="admin-title">
      <PageHeader
        id="admin-title"
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        lead={t('admin.lead')}
      />
      <p className="admin-warning" role="note">
        <Icon name="shield" size={18} /> {t('admin.dev_warning')}
      </p>

      {state === 'loading' && <StatusMessage tone="loading" title={t('admin.loading')} />}
      {state === 'unavailable' && (
        <StatusMessage tone="info" title={t('admin.unavailable_title')}>
          <p>{t('admin.unavailable_text')}</p>
        </StatusMessage>
      )}

      {state === 'ready' && client && status && (
        <div className="admin-console">
          <nav className="admin-nav" aria-label={t('admin.sections')}>
            {NAV.map((group) => (
              <div key={group.group} className="admin-nav__group">
                <p className="admin-nav__label">{t(group.group)}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          section === item.id ? 'admin-nav__item is-active' : 'admin-nav__item'
                        }
                        aria-current={section === item.id ? 'page' : undefined}
                        disabled={item.id === 'review' && selected === null}
                        onClick={() => setSection(item.id)}
                      >
                        <Icon name={item.icon} size={16} /> {t(`admin.section.${item.id}`)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="admin-console__main">
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
