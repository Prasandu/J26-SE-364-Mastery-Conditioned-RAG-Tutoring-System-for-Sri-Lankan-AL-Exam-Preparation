import type { AdminDraftSummary, AdminStatus } from '@vlab/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useAdmin } from './AdminContext';
import { AdminOverview } from './AdminOverview';
import { DraftList } from './DraftList';
import { DraftReview } from './DraftReview';
import { ImportPanel } from './ImportPanel';

export type AdminSection = 'overview' | 'drafts' | 'import' | 'review';

/**
 * Development-only practical administration: drafts, imports, review and validation. Nothing
 * here publishes, replaces the student catalog, or makes a practical runnable.
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
  const tab = (id: AdminSection, labelKey: string, disabled = false) => (
    <li>
      <button
        type="button"
        className={section === id ? 'nav-link nav-link--active' : 'nav-link'}
        aria-current={section === id ? 'page' : undefined}
        disabled={disabled}
        onClick={() => setSection(id)}
      >
        {t(labelKey)}
      </button>
    </li>
  );

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
        <>
          <nav className="admin-tabs" aria-label={t('admin.sections')}>
            <ul>
              {tab('overview', 'admin.section.overview')}
              {tab('drafts', 'admin.section.drafts')}
              {tab('import', 'admin.section.import')}
              {tab('review', 'admin.section.review', selected === null)}
            </ul>
          </nav>
          {section === 'overview' && <AdminOverview status={status} onNavigate={setSection} />}
          {section === 'drafts' && <DraftList drafts={drafts} onOpen={open} />}
          {section === 'import' && (
            <ImportPanel
              client={client}
              status={status}
              onImported={() => void refresh()}
              onOpen={open}
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
        </>
      )}
    </section>
  );
}
