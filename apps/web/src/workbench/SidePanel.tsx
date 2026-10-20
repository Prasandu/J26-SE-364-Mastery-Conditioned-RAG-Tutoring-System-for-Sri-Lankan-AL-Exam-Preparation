import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/ui/Icon';
import type { WorkbenchTab } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';
import { ActionPanel } from './ActionPanel';
import { GuidancePanel } from './GuidancePanel';
import { MeasurementPanel } from './MeasurementPanel';
import { ContextSection } from './notebook/ContextSection';
import { PredictionsFields } from './notebook/PredictionsFields';
import { ReflectionFields } from './notebook/ReflectionFields';
import { SummarySection } from './notebook/SummarySection';
import { ObservationLog } from './ObservationLog';
import { ProtocolPanel } from './ProtocolPanel';
import { AccessibleEquipmentList } from './AccessibleEquipmentList';
import type { SceneModel } from './sceneModel';

/** Context → Materials → Predictions → Protocol → Results → Reflection → Summary, in that order. */
const SECTIONS: readonly WorkbenchTab[] = [
  'context',
  'materials',
  'predictions',
  'protocol',
  'results',
  'reflection',
  'summary',
];
const SECTION_ICON: Record<WorkbenchTab, IconName> = {
  context: 'book',
  materials: 'flask',
  predictions: 'compass',
  protocol: 'clipboard',
  results: 'layers',
  reflection: 'chat',
  summary: 'check',
};

/**
 * Laboratory notebook: seven sections (V3-2) in one coherent panel instead of a separate page per
 * concern. Section navigation is presentation state only — switching sections never dispatches an
 * experiment action or changes the chemistry stage (`workbenchTab`, not `session.stage`).
 * Inactive sections stay mounted so typed input (predictions, reflection) survives switching.
 */
export function SidePanel({ model }: { model: SceneModel }) {
  const { t } = useTranslation();
  const tab = useSession((s) => s.workbenchTab);
  const setTab = useSession((s) => s.setWorkbenchTab);
  const automatic = useSession((s) => s.session?.mode === 'automatic');
  const active = SECTIONS.includes(tab) ? tab : 'protocol';
  const index = SECTIONS.indexOf(active);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const goTo = (next: WorkbenchTab) => {
    setTab(next);
    // A new section starts scrolled to its own top, like opening a fresh page of the notebook.
    // `.side-panel__scroll` is the notebook's own scroll region: the section nav above it and the
    // pager below it stay put as fixed flex rows. (jsdom has no scrollTo; real browsers do.)
    const scroller = document.querySelector<HTMLElement>('.side-panel__scroll');
    if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0 });
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? SECTIONS[(index + 1) % SECTIONS.length]
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? SECTIONS[(index - 1 + SECTIONS.length) % SECTIONS.length]
          : e.key === 'Home'
            ? SECTIONS[0]
            : e.key === 'End'
              ? SECTIONS.at(-1)
              : undefined;
    if (!next) return;
    e.preventDefault();
    goTo(next);
  };

  return (
    <div className="side-panel">
      <div className="side-panel__toolbar">
        <div className="side-panel__head">
          <Icon name="book" size={18} />
          <p className="side-panel__head-label">{t('ui.side.notebook')}</p>
        </div>
        <div
          className="notebook-nav"
          role="tablist"
          aria-label={t('ui.side.label')}
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
        >
          <ol>
            {SECTIONS.map((id, i) => (
              <li key={id}>
                <button
                  ref={(el) => {
                    refs.current[id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`side-tab-${id}`}
                  aria-selected={active === id}
                  aria-controls={`side-panel-${id}`}
                  tabIndex={active === id ? 0 : -1}
                  className={active === id ? 'notebook-nav__item is-active' : 'notebook-nav__item'}
                  onClick={() => goTo(id)}
                >
                  <span className="notebook-nav__marker" aria-hidden="true">
                    {i + 1}
                  </span>
                  <Icon name={SECTION_ICON[id]} size={14} />
                  <span className="notebook-nav__label">{t(`ui.side.${id}`)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="side-panel__scroll">
        {SECTIONS.map((id) => (
          <div
            key={id}
            role="tabpanel"
            id={`side-panel-${id}`}
            aria-labelledby={`side-tab-${id}`}
            hidden={active !== id}
            className="side-panel__body"
          >
            {id === 'context' && (
              <section className="panel" aria-labelledby="nb-context-title">
                <h2 id="nb-context-title" className="card__title">
                  <Icon name="book" /> {t('ui.side.context')}
                </h2>
                <ContextSection />
              </section>
            )}
            {id === 'materials' && <AccessibleEquipmentList model={model} />}
            {id === 'predictions' && (
              <section className="panel" aria-labelledby="nb-predictions-title">
                <h2 id="nb-predictions-title" className="card__title">
                  <Icon name="compass" /> {t('ui.side.predictions')}
                </h2>
                <PredictionsFields />
              </section>
            )}
            {id === 'protocol' && (
              <>
                <ProtocolPanel />
                <GuidancePanel />
                {!automatic && <ActionPanel />}
              </>
            )}
            {id === 'results' && (
              <>
                <MeasurementPanel />
                <ObservationLog />
              </>
            )}
            {id === 'reflection' && (
              <section className="panel" aria-labelledby="nb-reflection-title">
                <h2 id="nb-reflection-title" className="card__title">
                  <Icon name="chat" /> {t('ui.side.reflection')}
                </h2>
                <ReflectionFields />
              </section>
            )}
            {id === 'summary' && (
              <section className="panel" aria-labelledby="nb-summary-title">
                <h2 id="nb-summary-title" className="card__title">
                  <Icon name="check" /> {t('ui.side.summary')}
                </h2>
                <SummarySection />
              </section>
            )}
          </div>
        ))}
      </div>

      <nav className="notebook-pager" aria-label={t('ui.side.pager_label')}>
        <button
          type="button"
          className="notebook-pager__button notebook-pager__button--back"
          disabled={index === 0}
          onClick={() => goTo(SECTIONS[index - 1]!)}
        >
          <Icon name="arrow" size={14} />
          {t('ui.side.previous_section')}
        </button>
        <button
          type="button"
          className="notebook-pager__button"
          disabled={index === SECTIONS.length - 1}
          onClick={() => goTo(SECTIONS[index + 1]!)}
        >
          {t('ui.side.next_section')}
          <Icon name="arrow" size={14} />
        </button>
      </nav>
    </div>
  );
}
