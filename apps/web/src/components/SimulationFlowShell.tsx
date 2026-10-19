import type { ReactNode } from 'react';
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
 * and adds the step rail (`SessionNav`) and the Previous/Next pager (`FlowPager`) shared by every
 * step. The language switch stays reachable here exactly as in the site header, so switching
 * locale never requires leaving the practical or resetting its state.
 */
export function SimulationFlowShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const view = useSession((s) => s.view);
  const navigate = useSession((s) => s.navigate);

  return (
    <div className="flow-shell">
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
        <div className="flow-shell__tools">
          <LanguageSwitcher />
        </div>
      </header>
      <SessionNav current={view} />
      <main id="main" className="app-main flow-shell__body" tabIndex={-1}>
        {children}
      </main>
      <FlowPager current={view} />
      <HelpWidget />
    </div>
  );
}
