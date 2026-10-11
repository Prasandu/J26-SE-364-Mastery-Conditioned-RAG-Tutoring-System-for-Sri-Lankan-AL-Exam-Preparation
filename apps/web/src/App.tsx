import { lazy, Suspense, useState } from 'react';
import { AdminProvider, defaultAdminClient } from './admin/AdminContext';
import type { AdminClient } from './admin/adminClient';
import { I18nextProvider } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { createI18n } from './i18n';
import { LocaleSync } from './i18n/LocaleSync';
import type { SessionStore } from './store/sessionStore';
import { StoreProvider, useSession } from './store/StoreProvider';
import { DashboardView } from './views/DashboardView';
import { LibraryView } from './views/LibraryView';
import { NotebookView } from './views/NotebookView';
import { ReportView } from './views/ReportView';
import { ModeSelectView } from './views/ModeSelectView';
import { OverviewView } from './views/OverviewView';
import { PreLabView } from './views/PreLabView';
import { WorkbenchView } from './views/WorkbenchView';

/** Development-only admin tools: a separate chunk, loaded only when opened. */
const AdminView = lazy(() => import('./admin/AdminView'));

function CurrentView() {
  const view = useSession((s) => s.view);
  switch (view) {
    case 'dashboard':
      return <DashboardView />;
    case 'library':
      return <LibraryView />;
    case 'overview':
      return <OverviewView />;
    case 'prelab':
      return <PreLabView />;
    case 'mode':
      return <ModeSelectView />;
    case 'workbench':
      return <WorkbenchView />;
    case 'notebook':
      return <NotebookView />;
    case 'report':
      return <ReportView />;
    case 'admin':
      return (
        <Suspense fallback={<p className="hint-text">…</p>}>
          <AdminView />
        </Suspense>
      );
  }
}

export function App({
  store,
  adminClient,
}: {
  store?: SessionStore;
  adminClient?: AdminClient | null;
}) {
  const [i18n] = useState(() => createI18n('en'));
  const [admin] = useState(() => (adminClient === undefined ? defaultAdminClient() : adminClient));
  return (
    <I18nextProvider i18n={i18n}>
      <StoreProvider {...(store ? { store } : {})}>
        <AdminProvider client={admin}>
          <LocaleSync />
          <AppHeader />
          <main id="main" className="app-main" tabIndex={-1}>
            <CurrentView />
          </main>
          <ConfirmDialog />
        </AdminProvider>
      </StoreProvider>
    </I18nextProvider>
  );
}
