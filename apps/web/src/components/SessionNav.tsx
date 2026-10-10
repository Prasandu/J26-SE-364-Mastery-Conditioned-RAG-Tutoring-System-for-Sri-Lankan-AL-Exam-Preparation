import { useTranslation } from 'react-i18next';
import type { View } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';

/** Workbench / Notebook / Report / Change mode. The report opens only after submission. */
export function SessionNav({ current }: { current: View }) {
  const { t } = useTranslation();
  const navigate = useSession((s) => s.navigate);
  const submitted = useSession((s) => s.session?.status === 'submitted');
  const item = (view: View, labelKey: string, disabled = false) => (
    <button
      type="button"
      className={current === view ? 'button button--current' : 'button'}
      aria-current={current === view ? 'page' : undefined}
      disabled={disabled}
      aria-describedby={disabled ? 'report-locked' : undefined}
      onClick={() => navigate(view)}
    >
      {t(labelKey)}
    </button>
  );
  return (
    <nav className="session-nav" aria-label={t('ui.nav.session')}>
      {item('workbench', 'ui.nav.workbench')}
      {item('notebook', 'ui.nav.notebook')}
      {item('report', 'ui.nav.report', !submitted)}
      {item('mode', 'ui.workbench.change_mode')}
      {!submitted && (
        <span id="report-locked" className="visually-hidden">
          {t('ui.report.locked')}
        </span>
      )}
    </nav>
  );
}
