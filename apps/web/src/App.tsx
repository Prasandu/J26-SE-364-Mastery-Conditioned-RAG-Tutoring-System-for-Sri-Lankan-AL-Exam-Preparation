import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { createI18n } from './i18n';
import { LocaleSync } from './i18n/LocaleSync';
import type { SessionStore } from './store/sessionStore';
import { StoreProvider, useSession } from './store/StoreProvider';
import { LibraryView } from './views/LibraryView';
import { NotebookView } from './views/NotebookView';
import { ReportView } from './views/ReportView';
import { ModeSelectView } from './views/ModeSelectView';
import { OverviewView } from './views/OverviewView';
import { PreLabView } from './views/PreLabView';
import { WorkbenchView } from './views/WorkbenchView';

function CurrentView() {
  const view = useSession((s) => s.view);
  switch (view) {
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
  }
}

export function App({ store }: { store?: SessionStore }) {
  const [i18n] = useState(() => createI18n('en'));
  return (
    <I18nextProvider i18n={i18n}>
      <StoreProvider {...(store ? { store } : {})}>
        <LocaleSync />
        <AppHeader />
        <main id="main" className="app-main" tabIndex={-1}>
          <CurrentView />
        </main>
        <ConfirmDialog />
      </StoreProvider>
    </I18nextProvider>
  );
}
