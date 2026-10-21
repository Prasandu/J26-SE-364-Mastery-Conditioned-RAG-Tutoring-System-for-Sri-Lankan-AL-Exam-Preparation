import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { FlowPager } from './FlowPager';
import { HelpWidget } from './HelpWidget';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SessionNav } from './SessionNav';
import { Icon } from './ui/Icon';

/**
 * Full-screen distraction-free frame for the practical itself: pre-lab, the lab, the notebook,
 * post-lab reflection and the report (`FLOW_VIEWS`). Replaces the site header while a student is
 * in the practical — only a back control, the experiment title and the language switch remain —
 * and adds the step rail (`SessionNav`). Reading steps have an in-document Previous/Next pager;
 * the workbench uses notebook section controls instead of a global footer. The language switch
 * stays reachable here exactly as in the site header, so switching
 * locale never requires leaving the practical or resetting its state.
 */
export function SimulationFlowShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const view = useSession((s) => s.view);
  const navigate = useSession((s) => s.navigate);
  const laboratory = view === 'workbench';

  useEffect(() => {
    const body = document.getElementById('main');
    if (body) {
      body.scrollTop = 0;
      body.scrollLeft = 0;
    }
  }, [view]);

  return (
    <div className={laboratory ? 'flow-shell flow-shell--lab' : 'flow-shell'}>
      <a className="skip-link" href="#main">
        {t('ui.nav.skip_to_content')}
      </a>
      <header className="flow-shell__bar">
        <button
          type="button"
          className="flow-shell__back"
          onClick={() => navigate('overview')}
          aria-label={t('ui.flowshell.back')}
          title={t('ui.flowshell.back')}
        >
          <Icon name="arrow" size={20} />
        </button>
        <p className="flow-shell__title">{t(engine.definition.titleKey)}</p>
        {laboratory && <SessionNav current={view} />}
        <div className="flow-shell__tools">
          <LanguageSwitcher />
        </div>
      </header>
      {!laboratory && <SessionNav current={view} />}
      <main id="main" className="app-main flow-shell__body" tabIndex={-1}>
        {children}
        {view !== 'workbench' && <FlowPager current={view} />}
      </main>
      {/* Floating help launcher, pinned bottom-right (not in the header). */}
      <HelpWidget />
    </div>
  );
}
