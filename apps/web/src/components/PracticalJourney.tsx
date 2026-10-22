import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import {
  emptyPracticeJourney,
  PRACTICE_STAGES,
  type PracticeStage,
} from '../store/practiceJourney';

const EMPTY = emptyPracticeJourney();
export function usePracticalJourney(id: string) {
  const state = useSession((s) => s.practiceJourneys[id] ?? EMPTY);
  const update = useSession((s) => s.updatePracticeJourney);
  return { state, update: (patch: Partial<typeof state>) => update(id, patch) };
}

export function PracticalJourney({
  id,
  prelab,
  reflection,
  safety,
  apparatus,
  sources,
  setup,
  completed,
  onStart,
  children,
}: {
  id: string;
  prelab: string[];
  reflection: string[];
  safety: string[];
  apparatus: string[];
  sources: ReactNode;
  setup?: ReactNode;
  completed: boolean;
  onStart: () => boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { state: s, update } = usePracticalJourney(id);
  const formId = useId();
  const focus = useRef<HTMLHeadingElement>(null);
  const previous = useRef(s.stage);
  useEffect(() => {
    if (previous.current !== s.stage) focus.current?.focus();
    previous.current = s.stage;
  }, [s.stage]);
  const answered = (prompts: string[], values: Record<string, string>) =>
    prompts.every((_, index) => !!values[index]?.trim());
  const prepared = answered(prelab, s.prelab) && !!s.prediction.trim();
  const reflected = answered(reflection, s.reflection);
  const allowed = (stage: PracticeStage) => {
    if (stage === 'overview' || stage === 'prelab') return true;
    if (stage === 'setup') return prepared || s.started;
    if (stage === 'reflection') return completed && s.started;
    if (stage === 'report')
      return completed && s.started && reflected && prepared && s.safety && s.equipment;
    return s.started;
  };
  const writing = (kind: 'prelab' | 'reflection', prompts: string[]) => (
    <div className="practical-journey__questions">
      {prompts.map((prompt, index) => (
        <label key={index} htmlFor={`${formId}-${kind}-${index}`}>
          <span>
            {index + 1}. {prompt}
          </span>
          <textarea
            id={`${formId}-${kind}-${index}`}
            rows={4}
            maxLength={4000}
            value={s[kind][index] ?? ''}
            onChange={(event) => update({ [kind]: { ...s[kind], [index]: event.target.value } })}
          />
        </label>
      ))}
    </div>
  );
  const reportWriting = (prompts: string[], values: Record<string, string>) => (
    <dl>
      {prompts.map((prompt, index) => (
        <div key={index}>
          <dt>{prompt}</dt>
          <dd>{values[index]}</dd>
        </div>
      ))}
    </dl>
  );
  const index = PRACTICE_STAGES.indexOf(s.stage);
  const next = PRACTICE_STAGES[index + 1];
  return (
    <div className={`practical-journey practical-journey--${s.stage}`}>
      <nav className="practical-journey__nav" aria-label={t('ui.journey.navigation')}>
        <ol>
          {PRACTICE_STAGES.map((stage, i) => (
            <li key={stage}>
              <button
                type="button"
                disabled={!allowed(stage)}
                className={stage === s.stage ? 'button button--primary' : 'button'}
                aria-current={stage === s.stage ? 'step' : undefined}
                onClick={() => update({ stage })}
              >
                <span aria-hidden="true">{i + 1}</span> {t(`ui.journey.${stage}`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h2 ref={focus} tabIndex={-1} className="practical-journey__title">
        {t(`ui.journey.${s.stage}`)}
      </h2>
      {s.stage === 'prelab' ? (
        <section className="card practical-journey__document">
          <p>{t('ui.journey.writing_notice')}</p>
          {writing('prelab', prelab)}
          <label htmlFor={`${formId}-prediction`}>
            {t('ui.journey.prediction')}
            <textarea
              id={`${formId}-prediction`}
              rows={3}
              maxLength={4000}
              value={s.prediction}
              onChange={(event) => update({ prediction: event.target.value })}
            />
          </label>
          {!prepared && <p className="hint-text">{t('ui.journey.answer_required')}</p>}
          <div className="practical-journey__sources">{sources}</div>
        </section>
      ) : s.stage === 'setup' ? (
        <section className="card practical-journey__document">
          <h3>{t('teaching.instruments')}</h3>
          <ul>
            {apparatus.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <label className="check">
            <input
              type="checkbox"
              checked={s.equipment}
              onChange={(event) => update({ equipment: event.target.checked })}
            />
            {t('ui.journey.equipment_ack')}
          </label>
          <h3>{t('teaching.safety')}</h3>
          <ul>
            {safety.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <label className="check">
            <input
              type="checkbox"
              checked={s.safety}
              onChange={(event) => update({ safety: event.target.checked })}
            />
            {t('labs.safety_ack')}
          </label>
          {setup && (
            <details>
              <summary>{t('labs.settings')}</summary>
              {setup}
            </details>
          )}
          <p>{t('ui.journey.setup_note')}</p>
          <button
            type="button"
            className="button button--primary"
            disabled={!prepared || !s.safety || !s.equipment}
            onClick={() => {
              if (onStart()) update({ started: true, stage: 'workbench' });
            }}
          >
            {t('ui.journey.start')}
          </button>
        </section>
      ) : s.stage === 'reflection' ? (
        <section className="card practical-journey__document">
          <p>{t('ui.journey.reflection_note')}</p>
          {writing('reflection', reflection)}
          {!reflected && <p className="hint-text">{t('ui.journey.reflection_required')}</p>}
          <div className="practical-journey__sources">{sources}</div>
        </section>
      ) : (
        <>
          {children}
          {s.stage === 'report' && (
            <section className="card practical-journey__document">
              <h3>{t('ui.journey.preparation_record')}</h3>
              {reportWriting(prelab, s.prelab)}
              <h3>{t('ui.journey.prediction')}</h3>
              <p>{s.prediction}</p>
              <h3>{t('ui.journey.reflection')}</h3>
              {reportWriting(reflection, s.reflection)}
              <p>{t('ui.journey.writing_notice')}</p>
              {sources}
            </section>
          )}
        </>
      )}
      <div className="practical-journey__actions">
        {index > 0 && (
          <button
            type="button"
            className="button"
            onClick={() => update({ stage: PRACTICE_STAGES[index - 1]! })}
          >
            {t('ui.journey.previous')}
          </button>
        )}
        {next && s.stage !== 'setup' && (
          <button
            type="button"
            className="button button--primary"
            disabled={!allowed(next) || (s.stage === 'workbench' && !completed)}
            onClick={() => update({ stage: next })}
          >
            {t('ui.journey.continue', { stage: t(`ui.journey.${next}`) })}
          </button>
        )}
      </div>
      {['workbench', 'notebook'].includes(s.stage) && !completed && (
        <p className="hint-text practical-journey__progress">{t('ui.journey.complete_bench')}</p>
      )}
    </div>
  );
}
