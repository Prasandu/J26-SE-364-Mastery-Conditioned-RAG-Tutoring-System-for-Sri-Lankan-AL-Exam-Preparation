import { useTranslation } from 'react-i18next';
import { SourceList } from '../components/SourceList';
import { definition } from '../engine/content';
import { useSession } from '../store/StoreProvider';

/** PreLabPanel: answers live in the session store; no answers are shown before submission. */
export function PreLabView() {
  const { t } = useTranslation();
  const preLab = useSession((s) => s.preLab);
  const saveAnswer = useSession((s) => s.savePreLabAnswer);
  const setPrediction = useSession((s) => s.setPrediction);
  const toggleAck = useSession((s) => s.toggleSafetyAcknowledgement);
  const navigate = useSession((s) => s.navigate);
  const aims = definition.learningObjectives.filter((o) => o.id.startsWith('aim_'));
  const checklist = definition.safetyRules.filter((r) => r.kind === 'checklist');
  const precautions = definition.safetyRules.filter((r) => r.kind === 'handling');
  const solute = definition.chemicals.find(
    (c) => c.id === definition.expectedResults.soluteChemicalId,
  );
  const allAcknowledged = checklist.every((r) => preLab.acknowledgedSafety.includes(r.id));

  return (
    <section className="view view--prelab" aria-labelledby="prelab-title">
      <h1 id="prelab-title">{t('ui.prelab.title')}</h1>
      <p className="notice" role="note">
        {t('ui.prelab.demo_note')}
      </p>

      <div className="two-column">
        <section className="card" aria-labelledby="pl-aim">
          <h2 id="pl-aim">{t('ui.overview.aims')}</h2>
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
          <h2 id="pl-apparatus">{t('ui.prelab.apparatus_checklist')}</h2>
          <ul>
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
      </div>

      <section className="card" aria-labelledby="pl-questions">
        <h2 id="pl-questions">{t('ui.prelab.questions')}</h2>
        <p className="hint-text">{t('ui.prelab.answers_after_submission')}</p>
        {definition.preLabQuestions.map((q, i) => (
          <div className="field" key={q.id}>
            <label htmlFor={`prelab-${q.id}`}>
              {i + 1}. {t(q.promptKey)}
            </label>
            <textarea
              id={`prelab-${q.id}`}
              rows={3}
              value={preLab.answers[q.id] ?? ''}
              onChange={(e) => saveAnswer(q.id, e.target.value)}
            />
          </div>
        ))}
        <SourceList refs={definition.preLabQuestions.flatMap((q) => q.sourceRefs)} />
        <div className="field">
          <label htmlFor="prelab-prediction">{t('ui.prelab.prediction')}</label>
          <textarea
            id="prelab-prediction"
            rows={2}
            value={preLab.prediction}
            onChange={(e) => setPrediction(e.target.value)}
          />
        </div>
      </section>

      <section className="card card--safety" aria-labelledby="pl-safety">
        <h2 id="pl-safety">{t('ui.prelab.safety_ack')}</h2>
        <fieldset>
          <legend>{t('ui.prelab.safety_ack_legend')}</legend>
          {checklist.map((r) => (
            <div className="check" key={r.id}>
              <input
                type="checkbox"
                id={`ack-${r.id}`}
                checked={preLab.acknowledgedSafety.includes(r.id)}
                onChange={() => toggleAck(r.id)}
              />
              <label htmlFor={`ack-${r.id}`}>{t(r.textKey)}</label>
            </div>
          ))}
        </fieldset>
        <SourceList refs={checklist.flatMap((r) => r.sourceRefs)} />
        <p
          className={allAcknowledged ? 'status status--ok' : 'status status--pending'}
          aria-live="polite"
        >
          {t(allAcknowledged ? 'ui.prelab.safety_complete' : 'ui.prelab.safety_incomplete')}
        </p>
      </section>

      <nav className="view-nav" aria-label={t('ui.nav.steps')}>
        <button type="button" className="button" onClick={() => navigate('overview')}>
          {t('ui.nav.back_overview')}
        </button>
        <button type="button" className="button button--primary" onClick={() => navigate('mode')}>
          {t('ui.nav.to_mode')}
        </button>
      </nav>
    </section>
  );
}
