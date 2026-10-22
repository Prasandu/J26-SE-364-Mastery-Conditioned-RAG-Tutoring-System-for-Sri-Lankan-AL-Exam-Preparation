import { PracticalJourney, usePracticalJourney } from '../components/PracticalJourney';
import preparation from '../../../../content/library/handbook-preparation.v1.json';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { handbookPractice, type HandbookResult } from '../engine/localAdapter';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { HandbookScene } from '../workbench/handbook/HandbookScene';
import { handbookApparatus } from '../workbench/handbook/apparatus';
import { PracticeNotebook } from '../workbench/PracticeNotebook';
import { HelpWidget } from '../components/HelpWidget';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Icon } from '../components/ui/Icon';
import { useSession } from '../store/StoreProvider';

function Results({ result }: { result: HandbookResult }) {
  const { t } = useTranslation();
  return (
    <section className="handbook-lab__results" aria-label={t('labs.results')}>
      <p>{t(result.observation)}</p>
      {result.shape && (
        <p>
          <strong>{t('labs.shape')}:</strong> {t(`labs.shape.${result.shape}`)} ·{' '}
          {t('labs.lone_pairs', { count: result.lonePairs })}
        </p>
      )}
      {result.equation && <p className="handbook-lab__equation">{result.equation}</p>}
      {result.readings.length > 0 && (
        <dl className="facts">
          {result.readings.map((r) => (
            <div key={r.label}>
              <dt>{t(r.label)}</dt>
              <dd>
                {new Intl.NumberFormat(undefined, { maximumSignificantDigits: 7 }).format(r.value)}{' '}
                {r.unit}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function HandbookSimulationView() {
  const { t, i18n } = useTranslation();
  const lab = useSession((s) => s.handbookLab);
  const act = useSession((s) => s.actHandbookLab);
  const navigate = useSession((s) => s.navigate);
  const run = lab.active === null ? undefined : lab.runs[lab.active];
  const model = run ? handbookPractice.models.get(run.number) : undefined;
  const reference = handbook.entries.find((e) => e.experimentNumber === lab.active);
  const journeyId = `handbook:${lab.active}@${handbook.documentSha256}`;
  const journey = usePracticalJourney(journeyId);
  const tab = journey.state.stage === 'workbench' ? 'experiment' : journey.state.stage;
  const setTab = (stage: 'notebook' | 'reflection') => journey.update({ stage });
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(run?.inputs ?? {}).map(([k, v]) => [k, String(v)])),
  );
  if (!run || !model || !reference) return null;
  const questions = preparation.entries.find((entry) => entry.experimentNumber === run.number)!;
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const apparatus = handbookApparatus(model, run).map((node) =>
    t(`ui.practice.instrument.${node.kind}`),
  );
  const citation = (
    <p>
      {t('ui.source.citation', {
        title: t(handbook.documentTitleKey),
        pdf: `${reference.pdfPage}–${reference.pdfPageEnd}`,
        printed: `${reference.printedPage}–${reference.printedPageEnd}`,
      })}
    </p>
  );
  const editable = (control: (typeof model.controls)[number]) =>
    !run.completed &&
    (run.step === 0
      ? !!control.options || !control.liveAt || control.liveAt.includes(0)
      : !!control.liveAt?.includes(run.step));
  const usedControl = (id: string, inputs: Readonly<Record<string, string | number>>) =>
    !(
      [7, 8].includes(run.number) &&
      inputs.data_mode === 'practice_dataset' &&
      [
        'initial_acid',
        'initial_base',
        'final_temperature',
        'rise_a',
        'rise_b',
        'rise_c',
        'rise_d',
      ].includes(id)
    );
  const invalid = model.controls.some(
    (c) =>
      editable(c) &&
      !c.options &&
      (drafts[c.id]?.trim() === '' ||
        !Number.isFinite(Number(drafts[c.id])) ||
        Number(drafts[c.id]) < (c.min ?? -Infinity) ||
        Number(drafts[c.id]) > (c.max ?? Infinity)),
  );
  const step = (id: string) => {
    if (invalid) return;
    for (const control of model.controls) {
      if (
        editable(control) &&
        !act({
          type: 'input',
          id: control.id,
          value: control.options ? drafts[control.id]! : Number(drafts[control.id]),
        })
      )
        return;
    }
    if (act({ type: 'step', id }) && id === 'zero_balance')
      setDrafts((d) => ({ ...d, sliders: '0' }));
  };
  const source = (pages: readonly number[]) => pages.join(', ');
  const settings = (
    <>
      {' '}
      <fieldset disabled={run.completed}>
        <legend>{t('labs.settings')}</legend>
        {model.controls
          .filter((c) => usedControl(c.id, drafts))
          .map((control) => (
            <label key={control.id} className="handbook-lab__field">
              <span>
                {t(control.labelKey)} {control.unit && `(${control.unit})`}
              </span>
              {control.options ? (
                <select
                  disabled={!editable(control)}
                  value={drafts[control.id]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [control.id]: e.target.value }))}
                >
                  {control.options.map((option) => (
                    <option key={option} value={option}>
                      {t(`labs.choice.${option}`, { defaultValue: option })}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  disabled={!editable(control)}
                  type="number"
                  step={control.id === 'temperature' ? '1' : 'any'}
                  required
                  min={control.min}
                  max={control.max}
                  value={drafts[control.id]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [control.id]: e.target.value }))}
                />
              )}
            </label>
          ))}
      </fieldset>
    </>
  );
  const setupControls = model.controls.filter((c) => editable(c) && usedControl(c.id, drafts));

  return (
    <div className="handbook-lab">
      <header className="handbook-lab__header">
        <button type="button" className="button" onClick={() => navigate('library')}>
          <Icon name="arrow" />
          {t('labs.library')}
        </button>
        <h1>{t(reference.titleKey)}</h1>
        <LanguageSwitcher />
      </header>
      <main id="main" tabIndex={-1} className="handbook-lab__main">
        <p className="hint-text">{t('labs.local_notice')}</p>
        {i18n.language === 'si' && (
          <p className="hint-text">{t('ui.handbook.translation_draft')}</p>
        )}
        {[7, 8].includes(run.number) && (
          <p className="handbook-lab__precaution">{t('labs.synthetic_notice')}</p>
        )}
        <PracticalJourney
          id={journeyId}
          prelab={questions.preLab.map((question) => question[locale])}
          reflection={questions.postLab.map((question) => question[locale])}
          safety={[t(`labs.precaution.${run.number}`)]}
          apparatus={apparatus}
          sources={
            <>
              <p>{t('ui.journey.selected_questions')}</p>
              {citation}
            </>
          }
          setup={settings}
          completed={run.completed}
          onStart={() => run.safety || run.completed || act({ type: 'safety', value: true })}
        >
          {tab === 'overview' ? (
            <div className="teaching-guide">
              <section className="card">
                <h3>{t('teaching.aims')}</h3>
                <p>{t(reference.aimKey)}</p>
                <h3>{t('labs.method_source')}</h3>
                <p>{t(`labs.method.${run.number}`)}</p>
                <h3>{t('teaching.scope')}</h3>
                <p>{t(model.scopeKey)}</p>
              </section>
              <section className="card">
                <h3>{t('teaching.instruments')}</h3>
                <ul>
                  {apparatus.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <h3>{t('teaching.safety')}</h3>
                <p>{t(`labs.precaution.${run.number}`)}</p>
                <h3>{t('teaching.sources')}</h3>
                {citation}
              </section>
            </div>
          ) : tab === 'experiment' ? (
            <div className="handbook-lab__grid">
              <section className="handbook-lab__visual">
                <HandbookScene
                  model={model}
                  run={run}
                  settings={settings}
                  setupControls={setupControls}
                />
                {run.result && <Results result={run.result} />}
                <details className="handbook-lab__source">
                  <summary>{t('labs.method_source')}</summary>
                  <p>{t(`labs.method.${run.number}`)}</p>
                  <p>{t(model.scopeKey)}</p>
                  <p>
                    {t('ui.source.citation', {
                      title: t(handbook.documentTitleKey),
                      pdf: source(model.handbookPages),
                      printed: source(model.handbookPages.map((p) => p - 8)),
                    })}
                  </p>
                  {model.resourcePages.length > 0 && (
                    <p>{t('labs.resource_source', { pages: source(model.resourcePages) })}</p>
                  )}
                </details>
              </section>
              <PracticeNotebook>
                {{
                  context: (
                    <>
                      <h3>{t(reference.titleKey)}</h3>
                      <p>{t(reference.aimKey)}</p>
                      <p>{t(`labs.method.${run.number}`)}</p>
                      <p>{t(model.scopeKey)}</p>
                    </>
                  ),
                  materials: (
                    <ul>
                      {handbookApparatus(model, run).map((n) => (
                        <li key={n.id}>{t(`ui.practice.instrument.${n.kind}`)}</li>
                      ))}
                    </ul>
                  ),
                  predictions: (
                    <>
                      <p>{journey.state.prediction}</p>
                    </>
                  ),
                  protocol: (
                    <>
                      <p className="handbook-lab__precaution">
                        {t(`labs.precaution.${run.number}`)}
                      </p>
                      <div className="practice-next">
                        <strong>{t('ui.practice.next_step')}</strong>
                        <p>
                          {run.step < model.steps.length
                            ? t(`labs.action.${model.steps[run.step]}`)
                            : t('labs.complete')}
                        </p>
                        {setupControls.length > 0 && <p>{t('ui.practice.setup_required')}</p>}
                        <details>
                          <summary>{t('ui.practice.hint')}</summary>
                          <p>{t(`labs.method.${run.number}`)}</p>
                        </details>
                      </div>{' '}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={run.safety}
                          disabled={run.step > 0 || run.completed}
                          onChange={(e) => act({ type: 'safety', value: e.target.checked })}
                        />
                        {t('labs.safety_ack')}
                      </label>
                      {invalid && <p role="alert">{t('labs.error.invalid_input')}</p>}
                      <p aria-live="polite">
                        {t('labs.progress', { current: run.step, total: model.steps.length })}
                      </p>
                      <progress value={run.step} max={model.steps.length} />
                      <ol className="handbook-lab__steps">
                        {model.steps.map((id, i) => (
                          <li key={id}>
                            <button
                              type="button"
                              className={run.step === i ? 'button button--primary' : 'button'}
                              disabled={!run.safety || run.completed || i !== run.step || invalid}
                              onClick={() => step(id)}
                            >
                              <span aria-hidden="true">{i < run.step ? '✓' : i + 1}</span>
                              {t(`labs.action.${id}`)}
                            </button>
                          </li>
                        ))}
                      </ol>
                      {lab.error && <p role="alert">{t(`labs.error.${lab.error}`)}</p>}
                      <div className="button-row">
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={!run.result || run.recorded || run.completed}
                          onClick={() => act({ type: 'record' })}
                        >
                          {t('labs.record')}
                        </button>
                        <button
                          type="button"
                          className="button"
                          disabled={!run.recorded}
                          onClick={() => act({ type: 'next_trial' })}
                        >
                          {t('labs.next_trial')}
                        </button>
                        <button
                          type="button"
                          className="button"
                          disabled={!run.recorded || run.completed}
                          onClick={() => {
                            if (act({ type: 'finish' })) setTab('notebook');
                          }}
                        >
                          {t('labs.finish')}
                        </button>
                      </div>
                      <p>{t('labs.trial_count', { count: run.trials.length })}</p>
                      {[6, 14, 19, 20].includes(run.number) && (
                        <p className="hint-text">{t('labs.three_trials')}</p>
                      )}
                    </>
                  ),
                  results: (
                    <>
                      {run.result ? (
                        <Results result={run.result} />
                      ) : (
                        <p>{t('labs.in_progress')}</p>
                      )}
                    </>
                  ),
                  reflection: (
                    <>
                      <p>{t('ui.journey.reflection_note')}</p>
                      {questions.postLab.map((question, index) => (
                        <div key={index}>
                          <p>{question[locale]}</p>
                          <p>{journey.state.reflection[index]}</p>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="button"
                        disabled={!run.completed}
                        onClick={() => setTab('reflection')}
                      >
                        {t('ui.journey.reflection')}
                      </button>
                    </>
                  ),
                  summary: (
                    <>
                      <p>{t('labs.report_notice')}</p>
                      <p>{t('labs.trial_count', { count: run.trials.length })}</p>
                      <button
                        className="button"
                        type="button"
                        disabled={!run.completed}
                        onClick={() => setTab('reflection')}
                      >
                        {t('ui.journey.reflection')}
                      </button>
                    </>
                  ),
                }}
              </PracticeNotebook>
            </div>
          ) : tab === 'notebook' ? (
            <section className="card handbook-lab__document">
              <p>{t('labs.notes_notice')}</p>
              <label htmlFor="handbook-lab-notes">{t('labs.notes')}</label>
              <textarea
                id="handbook-lab-notes"
                rows={14}
                maxLength={20000}
                value={run.notes}
                onChange={(e) => act({ type: 'notes', value: e.target.value })}
              />
            </section>
          ) : (
            <section className="card handbook-lab__document">
              <p>{t(run.completed ? 'labs.complete' : 'labs.in_progress')}</p>
              <p>{t('labs.report_notice')}</p>
              {run.trials.map((trial, i) => (
                <section key={i}>
                  <h3>{t('labs.trial_number', { number: i + 1 })}</h3>
                  <dl className="facts">
                    {Object.entries(trial.inputs)
                      .filter(([id]) => usedControl(id, trial.inputs))
                      .map(([id, v]) => (
                        <div key={id}>
                          <dt>{t(`labs.input.${id}`)}</dt>
                          <dd>
                            {t(`labs.choice.${v}`, { defaultValue: String(v) })}{' '}
                            {model.controls.find((c) => c.id === id)?.unit}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <Results result={trial.result} />
                </section>
              ))}
              <p>{t('labs.trial_count', { count: run.trials.length })}</p>
              <h3>{t('labs.notes')}</h3>
              <p className="handbook-lab__notes">{run.notes}</p>
            </section>
          )}
        </PracticalJourney>
      </main>
      <HelpWidget>
        <div className="practice-support">
          <h2>{t('assistant.help_button')}</h2>
          <p>{t('ui.practice.scoped_support')}</p>
          <div className="practice-support__next">
            <strong>{t('ui.practice.next_step')}</strong>
            <p>
              {run.step < model.steps.length
                ? t(`labs.action.${model.steps[run.step]}`)
                : t('labs.complete')}
            </p>
          </div>
          <p>{t(`labs.method.${run.number}`)}</p>
          <p>{t(`labs.precaution.${run.number}`)}</p>
          <p>{t(model.scopeKey)}</p>
        </div>
      </HelpWidget>
    </div>
  );
}
