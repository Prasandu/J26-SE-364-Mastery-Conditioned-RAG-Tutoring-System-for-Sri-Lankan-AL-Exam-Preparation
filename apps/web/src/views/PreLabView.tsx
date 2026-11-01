import { useTranslation } from 'react-i18next';
import { SourceList } from '../components/SourceList';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { definition } from '../engine/content';
import { useSession } from '../store/StoreProvider';
import { PredictionsFields } from '../workbench/notebook/PredictionsFields';

/** PreLabPanel: answers live in the session store; no answers are shown before submission. */
export function PreLabView() {
  const { t } = useTranslation();
  const preLab = useSession((s) => s.preLab);
  const navigate = useSession((s) => s.navigate);
  const aims = definition.learningObjectives.filter((o) => o.id.startsWith('aim_'));
  const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist');
  const precautions = definition.safetyRules.filter((r) => r.kind === 'handling');
  const solute = definition.chemicals.find(
    (c) => c.id === definition.expectedResults.soluteChemicalId,
  );
  const acknowledged = checklist.filter((r) => preLab.acknowledgedSafety.includes(r.id)).length;
  const allAcknowledged = acknowledged === checklist.length;
  const answered = definition.preLabQuestions.filter(
    (q) => (preLab.answers[q.id] ?? '').trim() !== '',
  ).length;
  const predicted = preLab.prediction.trim() !== '';

  return (
    <section className="view view--prelab" aria-labelledby="prelab-title">
      <PageHeader id="prelab-title" title={t('ui.prelab.title')} lead={t('ui.prelab.lead')} />
      <p className="notice" role="note">
        {t('ui.prelab.demo_note')}
      </p>

      <div className="content-layout content-layout--prelab">
        <div className="content-layout__main">
          <section className="card" aria-labelledby="pl-questions">
            <h2 id="pl-questions" className="card__title">
              <Icon name="clipboard" /> {t('ui.prelab.questions')}
            </h2>
            <PredictionsFields />
          </section>

          <section className="card card--safety prelab-safety-reminder" aria-labelledby="pl-safety">
            <h2 id="pl-safety" className="card__title">
              <Icon name="shield" /> {t('ui.prelab.safety_ack')}
            </h2>
            <p>{t('ui.prelab.safety_move_note')}</p>
            <button type="button" className="button" onClick={() => navigate('mode')}>
              {t('ui.prelab.open_mode_safety')} <Icon name="arrow" size={18} />
            </button>
          </section>
        </div>

        <aside className="content-layout__side" aria-labelledby="pl-ready">
          <section className="card readiness">
            <h2 id="pl-ready" className="card__title">
              <Icon name="check" /> {t('ui.prelab.readiness')}
            </h2>
            <ul className="readiness__list">
              <li className={allAcknowledged ? 'readiness__item is-done' : 'readiness__item'}>
                <span>{t('ui.prelab.ready_safety')}</span>
                <span className="readiness__value">
                  {acknowledged} / {checklist.length}
                </span>
                <span className="meter" aria-hidden="true">
                  <span
                    className="meter__fill"
                    style={{ width: `${(acknowledged / checklist.length) * 100}%` }}
                  />
                </span>
                <span className="readiness__note">{t('ui.prelab.ready_safety_note')}</span>
              </li>
              <li className={answered > 0 ? 'readiness__item is-done' : 'readiness__item'}>
                <span>{t('ui.prelab.ready_questions')}</span>
                <span className="readiness__value">
                  {answered} / {definition.preLabQuestions.length}
                </span>
                <span className="readiness__note">{t('ui.prelab.ready_optional')}</span>
              </li>
              <li className={predicted ? 'readiness__item is-done' : 'readiness__item'}>
                <span>{t('ui.prelab.ready_prediction')}</span>
                <span className="readiness__value">
                  {t(predicted ? 'ui.prelab.done' : 'ui.prelab.not_yet')}
                </span>
                <span className="readiness__note">{t('ui.prelab.ready_optional')}</span>
              </li>
            </ul>
          </section>

          <section className="card" aria-labelledby="pl-aim">
            <h2 id="pl-aim" className="card__title">
              <Icon name="compass" /> {t('ui.overview.aims')}
            </h2>
            <ul>
              {aims.map((o) => (
                <li key={o.id}>{t(o.textKey)}</li>
              ))}
            </ul>
            <h3>{t('ui.prelab.theory')}</h3>
            <ul>
              {definition.prerequisites.map((p) => (
                <li key={p.id}>{t(p.textKey)}</li>
              ))}
            </ul>
            <ol className="calculation">
              {definition.expectedResults.calculations.map((c) => (
                <li key={c.id}>{t(c.stepKey)}</li>
              ))}
            </ol>
            <SourceList
              refs={[
                ...definition.prerequisites.flatMap((p) => p.sourceRefs),
                ...definition.expectedResults.calculations.flatMap((c) => c.result.sourceRefs),
              ]}
            />
          </section>
          <section className="card" aria-labelledby="pl-apparatus">
            <h2 id="pl-apparatus" className="card__title">
              <Icon name="flask" /> {t('ui.prelab.apparatus_checklist')}
            </h2>
            <ul className="item-list">
              {definition.apparatus
                .filter((a) => a.role !== 'distractor')
                .map((a) => (
                  <li key={a.id}>{t(a.nameKey)}</li>
                ))}
            </ul>
            <h3>{t('ui.overview.chemical')}</h3>
            <p>{solute && t(solute.nameKey)}</p>
            <h3>{t('ui.prelab.precautions')}</h3>
            <ul>
              {precautions.map((r) => (
                <li key={r.id}>{t(r.textKey)}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <button type="button" className="button" onClick={() => navigate('mode')}>
        {t('ui.journey.skip_prelab')}
      </button>
      <nav className="view-nav" aria-label={t('ui.nav.steps')}>
        <button type="button" className="button" onClick={() => navigate('overview')}>
          {t('ui.nav.back_overview')}
        </button>
        <button type="button" className="button button--primary" onClick={() => navigate('mode')}>
          {t('ui.nav.to_mode')} <Icon name="arrow" size={18} />
        </button>
      </nav>
    </section>
  );
}
