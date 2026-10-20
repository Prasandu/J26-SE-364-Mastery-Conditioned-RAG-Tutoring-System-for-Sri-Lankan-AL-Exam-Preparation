import { lazy, Suspense, useState } from 'react';
import { AdminProvider, defaultAdminClient } from './admin/AdminContext';
import type { AdminClient } from './admin/adminClient';
import { I18nextProvider } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SimulationFlowShell } from './components/SimulationFlowShell';
import { createI18n } from './i18n';
import { LocaleSync } from './i18n/LocaleSync';
import { isFlowView, type SessionStore } from './store/sessionStore';
import { StoreProvider, useSession } from './store/StoreProvider';
import { DashboardView } from './views/DashboardView';
import { LibraryView } from './views/LibraryView';
import { NotebookView } from './views/NotebookView';
import { ReflectionView } from './views/ReflectionView';
import { ReportView } from './views/ReportView';
import { ModeSelectView } from './views/ModeSelectView';
import { OverviewView } from './views/OverviewView';
import { PreLabView } from './views/PreLabView';
import { WorkbenchView } from './views/WorkbenchView';
import { Lab2DDefs } from './workbench/lab2d/Lab2DDefs';

/** Development-only admin tools: a separate chunk, loaded only when opened. */
const AdminView = lazy(() => import('./admin/AdminView'));
/**
 * R1 advanced-simulation-graphics prototype (chemistry-lab-advanced-sim-r1): an isolated,
 * dev-only proof-of-quality page at `/?r1=1`, never built into production bundles and never
 * mounted alongside the real session store — it drives its own engine session. See
 * `src/dev/r1Prototype/R1Prototype.tsx`.
 */
const R1Prototype = lazy(() =>
  import('./dev/r1Prototype/R1Prototype').then((m) => ({ default: m.R1Prototype })),
);
const showR1Prototype =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('r1');

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
    case 'reflection':
      return <ReflectionView />;
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

/**
 * The five practical steps (`FLOW_VIEWS`) render full-screen inside `SimulationFlowShell`
 * instead of the ordinary site header and width-limited page frame; every other view keeps the
 * normal site chrome.
 */
function AppBody() {
  const view = useSession((s) => s.view);
  if (isFlowView(view)) {
    return (
      <SimulationFlowShell>
        <CurrentView />
      </SimulationFlowShell>
    );
  }
  return (
    <>
      <AppHeader />
      <main id="main" className="app-main" tabIndex={-1}>
        <CurrentView />
      </main>
    </>
  );
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
  if (showR1Prototype) {
    return (
      <Suspense fallback={null}>
        <R1Prototype />
      </Suspense>
    );
  }
  return (
    <I18nextProvider i18n={i18n}>
      <StoreProvider {...(store ? { store } : {})}>
        <AdminProvider client={admin}>
          <LocaleSync />
          <AppBody />
          <ConfirmDialog />
          <Lab2DDefs />
        </AdminProvider>
      </StoreProvider>
    </I18nextProvider>
  );
}
