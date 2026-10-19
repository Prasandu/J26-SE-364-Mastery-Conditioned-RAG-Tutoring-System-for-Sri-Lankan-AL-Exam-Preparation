import { useTranslation } from 'react-i18next';
import { SourceList } from '../../components/SourceList';
import { definition } from '../../engine/content';
import { useSession } from '../../store/StoreProvider';

/** Limit from the API contract (PreLabSubmission: answers and prediction max 2000 characters). */
const MAX_ANSWER = 2000;

/**
 * The pre-lab questions and prediction, as fields only (no page chrome). Shared by the standalone
 * pre-lab page and the notebook's Predictions section — both read and write the same `preLab`
 * store state, so an answer typed in one place is the answer seen in the other; nothing is
 * duplicated or re-entered.
 */
export function PredictionsFields() {
  const { t } = useTranslation();
  const preLab = useSession((s) => s.preLab);
  const saveAnswer = useSession((s) => s.savePreLabAnswer);
  const setPrediction = useSession((s) => s.setPrediction);

  return (
    <>
      <p className="hint-text">{t('ui.prelab.answers_after_submission')}</p>
      {definition.preLabQuestions.map((q, i) => {
        const value = preLab.answers[q.id] ?? '';
        return (
          <div className="field" key={q.id}>
            <label htmlFor={`prelab-${q.id}`}>
              {i + 1}. {t(q.promptKey)}
            </label>
            <textarea
              id={`prelab-${q.id}`}
              rows={3}
              maxLength={MAX_ANSWER}
              value={value}
              aria-describedby={`prelab-${q.id}-count`}
              onChange={(e) => saveAnswer(q.id, e.target.value)}
            />
            <span id={`prelab-${q.id}-count`} className="field__counter">
              {t('ui.prelab.characters', { count: value.length, max: MAX_ANSWER })}
            </span>
          </div>
        );
      })}
      <SourceList refs={definition.preLabQuestions.flatMap((q) => q.sourceRefs)} />
      <div className="field">
        <label htmlFor="prelab-prediction">{t('ui.prelab.prediction')}</label>
        <textarea
          id="prelab-prediction"
          rows={2}
          maxLength={MAX_ANSWER}
          value={preLab.prediction}
          onChange={(e) => setPrediction(e.target.value)}
        />
      </div>
    </>
  );
}
