import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SourceList } from '../components/SourceList';
import { Icon } from '../components/ui/Icon';
import { definition } from '../engine/content';
import { useSession } from '../store/StoreProvider';
import { ReflectionQuestion } from '../workbench/notebook/ReflectionFields';

/**
 * Post-lab reflection: the handbook's post-lab question groups, as authored content references
 * (CLAUDE.md). Answers are free text, stored locally like pre-lab answers; no answer key is shown
 * here or anywhere else in the student app yet, so nothing is revealed early or late.
 *
 * Presented one question at a time, with a final review step, rather than four large boxes at
 * once. The steps are local view state only: every answer lives in the shared `postLab` store, so
 * moving between questions — or leaving for the notebook and coming back — keeps the drafts, and
 * nothing here grades an answer or marks an unanswered question complete.
 */
export function ReflectionView() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const postLab = useSession((s) => s.postLab);
  const [step, setStep] = useState(0);

  if (!session) return <p>{t('ui.workbench.no_session')}</p>;

  const questions = definition.postLabQuestions;
  const total = questions.length;
  /** The review step sits after the last question. */
  const reviewing = step >= total;
  const answered = questions.filter((q) => (postLab.answers[q.id] ?? '').trim() !== '').length;

  return (
    <section className="view view--reflection" aria-labelledby="reflection-title">
      <header className="notebook__head">
        <h1 id="reflection-title">{t('ui.reflection.title')}</h1>
        <p className="hint-text">{t('ui.reflection.lead')}</p>
      </header>

      <section className="card reflection-step" aria-labelledby="reflection-step-title">
        <div className="reflection-step__head">
          <h2 id="reflection-step-title" className="card__title">
            <Icon name="compass" />{' '}
            {reviewing
              ? t('ui.reflection.questions')
              : t('ui.protocol.stage_of', { current: step + 1, total })}
          </h2>
          {/* Progress counts only answers the student has actually written. */}
          <p className="reflection-step__progress" role="status" aria-live="polite">
            {t('ui.reflection.progress', { answered, total })}
          </p>
        </div>

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

        {reviewing ? (
          <ol className="reflection-review">
            {questions.map((q, i) => {
              const value = (postLab.answers[q.id] ?? '').trim();
              return (
                <li key={q.id}>
                  {/* The question itself is the control that returns to it, so the button needs
                      no separate label (and so no untranslated "Edit" string). */}
                  <button
                    type="button"
                    className="reflection-review__prompt"
                    onClick={() => setStep(i)}
                  >
                    {i + 1}. {t(q.promptKey)}
                  </button>
                  {value === '' ? (
                    <p className="reflection-review__empty">—</p>
                  ) : (
                    <p className="reflection-review__answer">{value}</p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <ReflectionQuestion index={step} />
        )}

        <SourceList refs={questions.flatMap((q) => q.sourceRefs)} />

        <nav className="notebook-pager" aria-label={t('ui.side.pager_label')}>
          <button
            type="button"
            className="notebook-pager__button notebook-pager__button--back"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <Icon name="arrow" size={14} />
            {t('ui.side.previous_section')}
          </button>
          <button
            type="button"
            className="notebook-pager__button"
            disabled={reviewing}
            onClick={() => setStep((s) => Math.min(total, s + 1))}
          >
            {t('ui.side.next_section')}
            <Icon name="arrow" size={14} />
          </button>
        </nav>
      </section>
    </section>
  );
}
