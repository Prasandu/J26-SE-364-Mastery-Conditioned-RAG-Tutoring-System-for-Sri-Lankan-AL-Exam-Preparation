import { useTranslation } from 'react-i18next';
import { SourceList } from '../../components/SourceList';
import { definition } from '../../engine/content';
import { useSession } from '../../store/StoreProvider';

/** Same limit as pre-lab answers (PreLabSubmission contract: max 2000 characters). */
const MAX_ANSWER = 2000;

/**
 * One post-lab question and its answer box. Shared by the compact workbench list and the
 * standalone reflection stepper, so both write to the same `postLab` answer in the store — the
 * student's draft follows them between the two views.
 */
export function ReflectionQuestion({ index }: { index: number }) {
  const { t } = useTranslation();
  const question = definition.postLabQuestions[index];
  const postLab = useSession((s) => s.postLab);
  const saveAnswer = useSession((s) => s.savePostLabAnswer);
  if (!question) return null;
  const value = postLab.answers[question.id] ?? '';
  return (
    <div className="field" key={question.id}>
      <label htmlFor={`reflection-${question.id}`}>
        {index + 1}. {t(question.promptKey)}
      </label>
      <textarea
        id={`reflection-${question.id}`}
        rows={6}
        maxLength={MAX_ANSWER}
        value={value}
        aria-describedby={`reflection-${question.id}-count`}
        onChange={(e) => saveAnswer(question.id, e.target.value)}
      />
      <span id={`reflection-${question.id}-count`} className="field__counter">
        {t('ui.prelab.characters', { count: value.length, max: MAX_ANSWER })}
      </span>
    </div>
  );
}

/**
 * The post-lab question groups, as fields only (no page chrome). Shared by the standalone
 * reflection page and the notebook's Reflection section — both read and write the same `postLab`
 * store state. No answer key is shown here or anywhere else in the student app; nothing is
 * graded or scored.
 */
export function ReflectionFields() {
  const { t } = useTranslation();
  const postLab = useSession((s) => s.postLab);
  const answered = definition.postLabQuestions.filter(
    (q) => (postLab.answers[q.id] ?? '').trim() !== '',
  ).length;

  return (
    <>
      <p className="hint-text">{t('ui.reflection.lead')}</p>
      <p className="hint-text">
        {t('ui.reflection.progress', { answered, total: definition.postLabQuestions.length })}
      </p>
      {definition.postLabQuestions.map((q, i) => (
        <ReflectionQuestion key={q.id} index={i} />
      ))}
      <SourceList refs={definition.postLabQuestions.flatMap((q) => q.sourceRefs)} />
    </>
  );
}
