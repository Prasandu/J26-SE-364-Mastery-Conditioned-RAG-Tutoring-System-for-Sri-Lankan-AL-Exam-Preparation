import { WrittenAnswerCheck } from '../../components/WrittenAnswerCheck';
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

  const total = definition.preLabQuestions.length;
  const answered = definition.preLabQuestions.filter(
    (q) => (preLab.answers[q.id] ?? '').trim() !== '',
  ).length;

  return (
    <>
      <p className="hint-text">{t('ui.prelab.answers_after_submission')}</p>
      {/* Counts answers the student has actually written. These questions prepare the student but
          do not gate starting the practical, so nothing here is marked required. */}
      <p className="prelab-progress" role="status" aria-live="polite">
        {t('ui.reflection.progress', { answered, total })}
      </p>
      <div
        className="reflection-step__progressbar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label={t('ui.reflection.progress', { answered, total })}
      >
        <span style={{ width: `${total === 0 ? 0 : (answered / total) * 100}%` }} />
      </div>
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
            <WrittenAnswerCheck
              value={value}
              questionKey={q.promptKey}
              guide={
                q.answerGuide
                  ? {
                      en: t(q.answerGuide.answerKey, { lng: 'en' }),
                      si: t(q.answerGuide.answerKey, { lng: 'si' }),
                    }
                  : null
              }
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
        <WrittenAnswerCheck value={preLab.prediction} />
      </div>
    </>
  );
}
