import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalText, TeachingDefinition } from '@vlab/contracts';
import {
  teachingPractice,
  type TeachingRun,
  type TeachingAction,
  type TeachingError,
  type TeachingTrial,
} from '../engine/localAdapter';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { TeachingScene2D } from '../workbench/teaching/TeachingScene';
import { useSession } from '../store/StoreProvider';

const Scene3D = lazy(() => import('../workbench/teaching/TeachingScene3D'));
type Tab = 'guide' | 'laboratory' | 'notebook' | 'report';

function TrialResult({ trial }: { trial: TeachingTrial }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const result = trial.kinetics;
  if (!result) return trial.outcome ? <p>{trial.outcome.observation[locale]}</p> : null;
  const xs = result.points.map((p) => p.logConcentration),
    ys = result.points.map((p) => p.logRate);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return (
    <section className="teaching-results">
      <p>{t('teaching.proxy_note')}</p>
      <div className="table-scroll">
        <table>
          <caption>{t('teaching.times_table')}</caption>
          <thead>
            <tr>
              <th>{t('teaching.concentration')} (mol dm⁻³)</th>
              <th>{t('teaching.time')} (s)</th>
              <th>{t('teaching.proxy')} (s⁻¹)</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((p) => (
              <tr key={p.concentration}>
                <td>{p.concentration}</td>
                <td>{p.time}</td>
                <td>{p.inverseTime.toPrecision(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <svg
        viewBox="0 0 600 330"
        role="img"
        aria-label={t('teaching.chart')}
        className="teaching-chart"
      >
        <path d="M65 20V270H570" stroke="currentColor" fill="none" />
        {result.points.map((p) => {
          const x = 65 + ((p.logConcentration - minX) / (maxX - minX || 1)) * 480,
            y = 260 - ((p.logRate - minY) / (maxY - minY || 1)) * 220;
          return (
            <g key={p.concentration}>
              <circle cx={x} cy={y} r="6" fill="#2563b8" />
              <text x={x} y={y - 13} textAnchor="middle" fontSize="13">
                {p.concentration}
              </text>
            </g>
          );
        })}
        <text x="310" y="310" textAnchor="middle">
          {t('teaching.log_concentration')}
        </text>
        <text x="18" y="150" textAnchor="middle" transform="rotate(-90 18 150)">
          {t('teaching.log_proxy')}
        </text>
      </svg>
      <p>
        <strong>
          {t('teaching.estimated_order')}: {result.order.toFixed(4)}
        </strong>{' '}
        · R²: {result.rSquared === null ? t('teaching.not_defined') : result.rSquared.toFixed(4)}
      </p>
    </section>
  );
}

export function TeachingWorkspace({
  definition: d,
  run,
  error,
  onAction,
  onBack,
  preview = false,
}: {
  definition: TeachingDefinition;
  run: TeachingRun;
  error: TeachingError | null;
  onAction: (action: TeachingAction) => boolean;
  onBack: () => void;
  preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'si' ? 'si' : 'en';
  const local = (text: LocalText) => text[locale];
  const [tab, setTab] = useState<Tab>('guide');
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d');
  const [selected, setSelected] = useState(d.apparatus[0]!.id);
  const [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0);
  const [temperature, setTemperature] = useState(
    run.temperatureC === null ? '' : String(run.temperatureC),
  );
  const [times, setTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(run.measurements).map(([k, v]) => [k, String(v)])),
  );
  const [inputError, setInputError] = useState<TeachingError | null>(null);
  const p = teachingPractice.project(d, run);
  const execute = () => {
    setInputError(null);
    if (p.test.temperatureRangeC) {
      if (!temperature.trim() || !Number.isFinite(Number(temperature))) {
        setInputError('temperature');
        return;
      }
      if (!onAction({ type: 'temperature', value: Number(temperature) })) return;
    }
    if (p.nextStep?.effect === 'measure' && d.template === 'fixed_volume_kinetics') {
      for (const c of d.concentrationsMolDm3) {
        const raw = times[String(c)];
        if (!raw?.trim() || !Number.isFinite(Number(raw)) || Number(raw) <= 0) {
          setInputError('measurements');
          return;
        }
        if (!onAction({ type: 'measurement', concentration: c, time: Number(raw) })) return;
      }
    }
    if (p.nextStep) onAction({ type: 'step', stepId: p.nextStep.id, apparatusId: selected });
  };
  const list = (items: readonly LocalText[]) => (
    <ul>
      {items.map((text, i) => (
        <li key={i}>{local(text)}</li>
      ))}
    </ul>
  );
  const currentTrial: TeachingTrial = {
    sampleId: run.sampleId,
    testId: run.testId,
    temperatureC: run.temperatureC,
    measurements: run.measurements,
    outcome: p.outcome,
    kinetics: p.kinetics,
  };
  return (
    <div className="handbook-lab teaching-workspace">
      <header className="handbook-lab__header">
        <button type="button" className="button" onClick={onBack}>
          {t(preview ? 'teaching.back_editor' : 'labs.library')}
        </button>
        <h1>{local(d.title)}</h1>
        <LanguageSwitcher />
      </header>
      <main
        className="handbook-lab__main"
        id={preview ? 'teaching-preview-main' : 'main'}
        tabIndex={-1}
      >
        <nav className="handbook-lab__tabs" aria-label={t('teaching.sections')}>
          {(['guide', 'laboratory', 'notebook', 'report'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'button button--primary' : 'button'}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {t(`teaching.tab.${id}`)}
            </button>
          ))}
        </nav>
        <p className="hint-text">
          {t(preview ? 'teaching.preview_notice' : 'teaching.local_notice')}
        </p>
        {locale === 'si' && <p className="hint-text">{t('ui.handbook.translation_draft')}</p>}
        {tab === 'guide' ? (
          <div className="teaching-guide">
            <section className="card">
              <p className="badge">{t('teaching.available')}</p>
              <h2>{t('teaching.aims')}</h2>
              {list(d.aims)}
              <p>{local(d.background)}</p>
              <h2>{t('teaching.scope')}</h2>
              <p>{local(d.limitations)}</p>
              <h2>{t('teaching.chemicals')}</h2>
              {list(d.chemicals)}
              <h2>{t('teaching.instruments')}</h2>
              <ul>
                {d.apparatus.map((a) => (
                  <li key={a.id}>
                    {local(a.label)}
                    {a.capacityCm3 !== null ? ` · ${a.capacityCm3} cm³` : ''}
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2>{t('teaching.safety')}</h2>
              {list(d.safety)}
              <h2>{t('teaching.pre_lab')}</h2>
              {list(d.preLab)}
              <h2>{t('teaching.post_lab')}</h2>
              {list(d.postLab)}
              <h2>{t('teaching.sources')}</h2>
              <ol>
                {d.sources.map((s, i) => (
                  <li key={i}>
                    <strong>{s.title}</strong>
                    {s.pdfPages.length > 0 && (
                      <p>{t('teaching.pdf_pages', { pages: s.pdfPages.join(', ') })}</p>
                    )}
                    {s.url && (
                      <p>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {t('teaching.open_source')}
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setTab('laboratory')}
              >
                {t('teaching.enter_lab')}
              </button>
            </section>
          </div>
        ) : tab === 'laboratory' ? (
          <div className="handbook-lab__grid teaching-layout">
            <section className="handbook-lab__visual">
              <div className="teaching-view-toolbar">
                <div role="group" aria-label={t('teaching.dimension')}>
                  {(['2d', '3d'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      className={dimension === view ? 'button button--primary' : 'button'}
                      aria-pressed={dimension === view}
                      onClick={() => setDimension(view)}
                    >
                      {t(`teaching.${view}`)}
                    </button>
                  ))}
                </div>
                {dimension === '3d' && (
                  <div role="group" aria-label={t('teaching.camera')}>
                    <button
                      type="button"
                      className="button"
                      aria-label={t('teaching.zoom_in')}
                      onClick={() => setZoom((v) => Math.min(1.6, v + 0.1))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="button"
                      aria-label={t('teaching.zoom_out')}
                      onClick={() => setZoom((v) => Math.max(0.65, v - 0.1))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        setZoom(1);
                        setReset((v) => v + 1);
                      }}
                    >
                      {t('teaching.reset_view')}
                    </button>
                  </div>
                )}
              </div>
              <div className="teaching-stage">
                {dimension === '2d' ? (
                  <TeachingScene2D
                    definition={d}
                    projection={p}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <Suspense fallback={<p>{t('teaching.loading3d')}</p>}>
                    <Scene3D
                      definition={d}
                      projection={p}
                      selected={selected}
                      onSelect={setSelected}
                      zoom={zoom}
                      reset={reset}
                    />
                  </Suspense>
                )}
              </div>
              <p className="hint-text">{t('teaching.visual_note')}</p>
              <fieldset className="teaching-tool-list">
                <legend>{t('teaching.choose_instrument')}</legend>
                {d.apparatus.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    className={selected === a.id ? 'button button--primary' : 'button'}
                    aria-pressed={selected === a.id}
                    onClick={() => setSelected(a.id)}
                  >
                    {i + 1}. {local(a.label)}
                  </button>
                ))}
              </fieldset>
              {p.finished && (
                <section className="handbook-lab__results" aria-label={t('teaching.observations')}>
                  <h2>{t('teaching.observations')}</h2>
                  <TrialResult trial={currentTrial} />
                </section>
              )}
            </section>
            <aside className="handbook-lab__controls">
              <h2>{t('teaching.procedure')}</h2>
              <label className="check">
                <input
                  type="checkbox"
                  checked={run.safety}
                  disabled={run.step > 0}
                  onChange={(e) => onAction({ type: 'safety', value: e.target.checked })}
                />
                {t('labs.safety_ack')}
              </label>
              <details>
                <summary>{t('teaching.safety')}</summary>
                {list(d.safety)}
              </details>
              <label className="handbook-lab__field">
                <span>{t('teaching.sample')}</span>
                <select
                  disabled={run.step > 0 || run.completed}
                  value={run.sampleId}
                  onChange={(e) =>
                    onAction({ type: 'select', sampleId: e.target.value, testId: run.testId })
                  }
                >
                  {d.samples.map((s) => (
                    <option key={s.id} value={s.id}>
                      {local(s.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="handbook-lab__field">
                <span>{t('teaching.test')}</span>
                <select
                  disabled={run.step > 0 || run.completed}
                  value={run.testId}
                  onChange={(e) =>
                    onAction({ type: 'select', sampleId: run.sampleId, testId: e.target.value })
                  }
                >
                  {d.tests.map((s) => (
                    <option key={s.id} value={s.id}>
                      {local(s.label)}
                    </option>
                  ))}
                </select>
              </label>
              {p.test.temperatureRangeC && (
                <label className="handbook-lab__field">
                  <span>{t('teaching.bath_temperature')} (°C)</span>
                  <input
                    type="number"
                    step="any"
                    value={temperature}
                    disabled={run.recorded}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                  <span className="hint-text">
                    {t('teaching.temperature_required', {
                      min: p.test.temperatureRangeC[0],
                      max: p.test.temperatureRangeC[1],
                    })}
                  </span>
                </label>
              )}
              {d.template === 'fixed_volume_kinetics' && (
                <fieldset>
                  <legend>{t('teaching.enter_times')}</legend>
                  <p>{t('teaching.no_synthetic')}</p>
                  {d.concentrationsMolDm3.map((c) => (
                    <label key={c} className="handbook-lab__field">
                      <span>
                        {c} mol dm⁻³ · {t('teaching.time')} (s)
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        required
                        disabled={run.recorded}
                        value={times[String(c)] ?? ''}
                        onChange={(e) => setTimes((v) => ({ ...v, [String(c)]: e.target.value }))}
                      />
                    </label>
                  ))}
                </fieldset>
              )}
              <p aria-live="polite">
                {t('labs.progress', { current: run.step, total: p.test.steps.length })}
              </p>
              <progress value={run.step} max={p.test.steps.length} />
              {p.nextStep ? (
                <section className="teaching-next">
                  <h3>{local(p.nextStep.title)}</h3>
                  <p>{local(p.nextStep.instruction)}</p>
                  <p>
                    <strong>
                      {t('teaching.required_instrument')}:{' '}
                      {local(d.apparatus.find((a) => a.id === p.nextStep!.apparatusId)!.label)}
                    </strong>
                  </p>
                  <button
                    type="button"
                    className="button button--primary teaching-execute"
                    disabled={!run.safety || run.completed}
                    onClick={execute}
                  >
                    {t('teaching.perform_step')}
                  </button>
                </section>
              ) : (
                <p>{t('teaching.procedure_complete')}</p>
              )}
              {(inputError || error) && (
                <p role="alert">{t(`teaching.error.${inputError ?? error}`)}</p>
              )}
              <details>
                <summary>{t('teaching.all_steps')}</summary>
                <ol>
                  {p.test.steps.map((s) => (
                    <li key={s.id}>{local(s.title)}</li>
                  ))}
                </ol>
              </details>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!p.finished || run.recorded || run.completed}
                  onClick={() => onAction({ type: 'record' })}
                >
                  {t('labs.record')}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!run.recorded}
                  onClick={() => {
                    if (onAction({ type: 'new_trial' })) {
                      setTimes({});
                      setTemperature('');
                      setInputError(null);
                    }
                  }}
                >
                  {t('labs.next_trial')}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!run.recorded || run.completed}
                  onClick={() => {
                    if (onAction({ type: 'finish' })) setTab('report');
                  }}
                >
                  {t('labs.finish')}
                </button>
              </div>
              <p>{t('labs.trial_count', { count: run.trials.length })}</p>
            </aside>
          </div>
        ) : tab === 'notebook' ? (
          <section className="card handbook-lab__document">
            <h2>{t('labs.tab.notebook')}</h2>
            <p>{t('labs.notes_notice')}</p>
            <label htmlFor="teaching-notes">{t('labs.notes')}</label>
            <textarea
              id="teaching-notes"
              rows={14}
              maxLength={20000}
              value={run.notes}
              onChange={(e) => onAction({ type: 'notes', value: e.target.value })}
            />
          </section>
        ) : (
          <section className="card handbook-lab__document">
            <h2>{t('labs.tab.report')}</h2>
            <p>{t(run.completed ? 'labs.complete' : 'labs.in_progress')}</p>
            <p>{t('teaching.report_notice')}</p>
            {run.trials.map((trial, i) => (
              <section key={i}>
                <h3>{t('labs.trial_number', { number: i + 1 })}</h3>
                <p>
                  {local(d.samples.find((s) => s.id === trial.sampleId)!.label)} ·{' '}
                  {local(d.tests.find((x) => x.id === trial.testId)!.label)}
                </p>
                {trial.temperatureC !== null && (
                  <p>
                    {t('teaching.bath_temperature')}: {trial.temperatureC} °C
                  </p>
                )}
                <TrialResult trial={trial} />
              </section>
            ))}
            <h3>{t('labs.notes')}</h3>
            <p className="handbook-lab__notes">{run.notes}</p>
          </section>
        )}
      </main>
    </div>
  );
}
export function TeachingSandbox({
  definition,
  onBack,
}: {
  definition: TeachingDefinition;
  onBack: () => void;
}) {
  const [state, setState] = useState(() => ({
    run: teachingPractice.create(definition),
    error: null as TeachingError | null,
  }));
  const current = useRef(state);
  return (
    <TeachingWorkspace
      definition={definition}
      run={state.run}
      error={state.error}
      preview
      onBack={onBack}
      onAction={(a) => {
        const result = teachingPractice.dispatch(
          definition,
          current.current.run,
          a,
          current.current.run.sequence,
        );
        current.current = { run: result.state, error: result.error };
        setState(current.current);
        return result.accepted;
      }}
    />
  );
}
export default function TeachingView() {
  const state = useSession((s) => s.teaching),
    act = useSession((s) => s.actTeaching),
    navigate = useSession((s) => s.navigate);
  const d = state.active,
    run = d ? state.runs[`${d.id}@${d.revision}`] : null;
  if (!d || !run) return null;
  return (
    <TeachingWorkspace
      definition={d}
      run={run}
      error={state.error}
      onAction={act}
      onBack={() => navigate('library')}
    />
  );
}
