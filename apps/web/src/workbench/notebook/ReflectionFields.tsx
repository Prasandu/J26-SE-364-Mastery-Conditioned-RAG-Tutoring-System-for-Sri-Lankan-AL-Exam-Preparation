import { useTranslation } from 'react-i18next';
import { SourceList } from '../../components/SourceList';
import { definition } from '../../engine/content';
import { useSession } from '../../store/StoreProvider';

/** Same limit as pre-lab answers (PreLabSubmission contract: max 2000 characters). */
const MAX_ANSWER = 2000;

/**
 * The post-lab question groups, as fields only (no page chrome). Shared by the standalone
 * reflection page and the notebook's Reflection section — both read and write the same `postLab`
 * store state. No answer key is shown here or anywhere else in the student app; nothing is
 * graded or scored.
 */
export function ReflectionFields() {
  const { t } = useTranslation();
  const postLab = useSession((s) => s.postLab);
  const saveAnswer = useSession((s) => s.savePostLabAnswer);
  const answered = definition.postLabQuestions.filter(
    (q) => (postLab.answers[q.id] ?? '').trim() !== '',
  ).length;

  return (
    <>
      <p className="hint-text">{t('ui.reflection.lead')}</p>
      <p className="hint-text">
        {t('ui.reflection.progress', { answered, total: definition.postLabQuestions.length })}
      </p>
      {definition.postLabQuestions.map((q, i) => {
        const value = postLab.answers[q.id] ?? '';
        return (
          <div className="field" key={q.id}>
            <label htmlFor={`reflection-${q.id}`}>
              {i + 1}. {t(q.promptKey)}
            </label>
            <textarea
              id={`reflection-${q.id}`}
              rows={3}
              maxLength={MAX_ANSWER}
              value={value}
              aria-describedby={`reflection-${q.id}-count`}
              onChange={(e) => saveAnswer(q.id, e.target.value)}
            />
            <span id={`reflection-${q.id}-count`} className="field__counter">
              {t('ui.prelab.characters', { count: value.length, max: MAX_ANSWER })}
            </span>
          </div>
        );
      })}
      <SourceList refs={definition.postLabQuestions.flatMap((q) => q.sourceRefs)} />
    </>
  );
}
