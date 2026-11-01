import { useTranslation } from 'react-i18next';
import { FLOW_VIEWS, type View } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';
import { Icon } from './ui/Icon';
import { STEP_LABEL } from './SessionNav';

/**
 * Previous/Next across the five flow steps. The first step's "previous" and the last step's
 * "next" are left out rather than pointed somewhere unrelated; pre-lab's own in-page button
 * already leads to mode selection, so "next" from pre-lab reuses that same target and label.
 */
export function FlowPager({ current }: { current: View }) {
  const { t } = useTranslation();
  const navigate = useSession((s) => s.navigate);
  const submitted = useSession((s) => s.session?.status === 'submitted');
  const index = (FLOW_VIEWS as readonly View[]).indexOf(current);
  const previous = index > 0 ? FLOW_VIEWS[index - 1] : null;
  const next = index >= 0 && index < FLOW_VIEWS.length - 1 ? FLOW_VIEWS[index + 1] : null;
  const nextDisabled = next === 'report' && !submitted;

  if (!previous && !next && current !== 'prelab') return null;

  return (
    <nav className="flow-pager" aria-label={t('ui.flowpager.label')}>
      <div className="flow-pager__side">
        {previous && (
          <button type="button" className="flow-pager__button" onClick={() => navigate(previous)}>
            <Icon name="arrow" size={16} />
            <span>
              <span className="flow-pager__kicker">{t('ui.flowpager.previous')}</span>
              {t(STEP_LABEL[previous])}
            </span>
          </button>
        )}
      </div>
      <div className="flow-pager__side flow-pager__side--next">
        {current === 'prelab' ? (
          <button
            type="button"
            className="flow-pager__button flow-pager__button--primary"
            onClick={() => navigate('mode')}
          >
            <span>
              <span className="flow-pager__kicker">{t('ui.flowpager.next')}</span>
              {t('ui.flow.mode')}
            </span>
            <Icon name="arrow" size={16} />
          </button>
        ) : (
          next && (
            <button
              type="button"
              className="flow-pager__button flow-pager__button--primary"
              disabled={nextDisabled}
              aria-describedby={nextDisabled ? 'flow-pager-report-locked' : undefined}
              onClick={() => navigate(next)}
            >
              <span>
                <span className="flow-pager__kicker">{t('ui.flowpager.next')}</span>
                {t(STEP_LABEL[next])}
              </span>
              <Icon name="arrow" size={16} />
            </button>
          )
        )}
        {nextDisabled && (
          <span id="flow-pager-report-locked" className="visually-hidden">
            {t('ui.report.locked')}
          </span>
        )}
      </div>
    </nav>
  );
}
