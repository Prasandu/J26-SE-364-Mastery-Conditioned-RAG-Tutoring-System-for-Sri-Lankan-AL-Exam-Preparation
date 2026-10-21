import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  handbookPractice,
  type HandbookResult,
  type HandbookRun,
  type HandbookModel,
} from '../engine/localAdapter';
import handbook from '../../../../content/library/handbook-first20.v1.json';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Icon } from '../components/ui/Icon';
import { useSession } from '../store/StoreProvider';

function Instrument({ model, run }: { model: HandbookModel; run: HandbookRun }) {
  const { t } = useTranslation();
  let preview: HandbookResult | null = null;
  try {
    preview = handbookPractice.preview(run.number, run.inputs);
  } catch {
    /* Invalid inputs have no fabricated visual result. */
  }
  const visible = run.step >= model.steps.length - 1;
  const colour = visible ? (preview?.colour ?? '#b9dfea') : '#b9dfea';
  const active = run.step > 0;
  const label = String(
    Object.entries(run.inputs).find(([, v]) => typeof v === 'string')?.[1] ?? '',
  );
  const molecule = run.step >= 2 ? (preview?.bonds ?? 0) : 0;
  const positions: Record<string, readonly (readonly [number, number])[]> = {
    linear: [
      [-140, 0],
      [140, 0],
    ],
    bent: [
      [-115, 85],
      [115, 85],
    ],
    trigonal_planar: [
      [0, -120],
      [-125, 80],
      [125, 80],
    ],
    tetrahedral: [
      [0, -120],
      [-130, 65],
      [105, 95],
      [75, 10],
    ],
    trigonal_pyramidal: [
      [-130, 45],
      [70, 100],
      [110, 10],
    ],
    seesaw: [
      [0, -125],
      [0, 125],
      [-130, 35],
      [110, 65],
    ],
    t_shaped: [
      [0, -125],
      [0, 125],
      [130, 0],
    ],
    square_planar: [
      [-125, -60],
      [125, -60],
      [125, 60],
      [-125, 60],
    ],
    square_pyramidal: [
      [-125, -60],
      [125, -60],
      [125, 60],
      [-125, 60],
      [0, -145],
    ],
    octahedral: [
      [-125, -60],
      [125, -60],
      [125, 60],
      [-125, 60],
      [0, -145],
      [0, 145],
    ],
  };
  return (
    <svg
      className="handbook-lab__scene"
      viewBox="0 0 900 500"
      role="img"
      aria-label={t(`labs.graphic.${model.graphic}`)}
    >
      <defs>
        <linearGradient id="teaching-wall" x2="0" y2="1">
          <stop stopColor="#08709a" />
          <stop offset="1" stopColor="#053651" />
        </linearGradient>
        <linearGradient id="teaching-glass">
          <stop stopColor="#d7edf7" stopOpacity=".6" />
          <stop offset=".6" stopColor="#eefaff" stopOpacity=".14" />
          <stop offset="1" stopColor="#b4d5e9" stopOpacity=".65" />
        </linearGradient>
      </defs>
      <rect width="900" height="500" fill="url(#teaching-wall)" />
      <path d="M0 355H900V500H0Z" fill="#60869b" />
      <path d="M0 355H900" stroke="#acc8d7" strokeWidth="14" />
      {model.graphic === 'rays' ? (
        <>
          <rect
            x="135"
            y="115"
            width="630"
            height="190"
            rx="75"
            fill="url(#teaching-glass)"
            stroke="#b0d5e6"
            strokeWidth="3"
          />
          <path d="M225 140V280M660 140V280" stroke="#c6d4db" strokeWidth="15" />
          <text x="203" y="330" fill="white">
            −
          </text>
          <text x="650" y="330" fill="white">
            +
          </text>
          {run.step >= 2 && run.step < 4 && (
            <>
              <path
                d={
                  run.inputs.tube === 'electric'
                    ? `M230 210 Q450 210 654 ${run.inputs.polarity === 'positive_above' ? 150 : 270}`
                    : run.inputs.tube === 'magnetic'
                      ? 'M230 210 Q450 210 654 150'
                      : run.inputs.tube === 'cross'
                        ? 'M230 160H654M230 260H654'
                        : 'M230 210H654'
                }
                stroke="#89ef9c"
                strokeWidth="6"
                fill="none"
              />
              <ellipse cx="665" cy="210" rx="12" ry="65" fill="#91ee9f" opacity=".55" />
              {run.inputs.tube === 'cross' && (
                <>
                  <path d="M450 170V250M425 200H475" stroke="#203443" strokeWidth="12" />
                  <path d="M665 175V245M657 200H673" stroke="#203443" strokeWidth="8" />
                </>
              )}
              {run.inputs.tube === 'paddle' && (
                <g className="handbook-lab__wheel">
                  <circle cx="450" cy="210" r="35" stroke="#bcd0db" strokeWidth="4" fill="none" />
                  <path d="M415 210H485M450 175V245" stroke="#d6e4ec" strokeWidth="8" />
                </g>
              )}
            </>
          )}
        </>
      ) : model.graphic === 'molecule' ? (
        <>
          <circle cx="450" cy="220" r="40" fill="#6eafe5" stroke="#b5d8f4" strokeWidth="3" />
          {Array.from({ length: molecule }, (_, i) => {
            const offset = positions[preview?.shape ?? 'linear']?.[i] ?? [130, 0];
            const x = 450 + offset[0],
              y = 220 + offset[1];
            return (
              <g key={i}>
                <line
                  x1="450"
                  y1="220"
                  x2={x}
                  y2={y}
                  stroke="#d7e5ed"
                  strokeWidth="10"
                  strokeDasharray={
                    ['tetrahedral', 'trigonal_pyramidal', 'seesaw', 'octahedral'].includes(
                      preview?.shape ?? '',
                    ) && i === 2
                      ? '5 8'
                      : undefined
                  }
                />
                <circle cx={x} cy={y} r="27" fill="#e9f5ff" stroke="#88b8d6" strokeWidth="3" />
              </g>
            );
          })}
          {molecule > 0 &&
            Array.from({ length: preview?.lonePairs ?? 0 }, (_, i) => (
              <g key={`pair-${i}`} fill="#ffd67d">
                <circle cx={423 + i * 16} cy="167" r="4" />
                <circle cx={423 + i * 16} cy="155" r="4" />
              </g>
            ))}
          <text x="450" y="405" textAnchor="middle" fill="white" fontSize="23">
            {String(run.inputs.molecule)}
          </text>
        </>
      ) : model.graphic === 'balance' ? (
        <>
          <rect x="230" y="300" width="440" height="40" rx="12" fill="#213c4c" />
          <path d="M320 300V210M310 210H590" stroke="#afc3d0" strokeWidth="13" />
          <ellipse cx="320" cy="205" rx="70" ry="12" fill="#d9e5eb" />
          {run.step >= 3 && <rect x="295" y="160" width="50" height="40" rx="5" fill="#c9aa69" />}
          <path d="M400 230H620M400 252H620M400 274H620" stroke="#8ba1b0" strokeWidth="8" />
          <path
            d="M600 170V206"
            stroke={
              visible && preview?.observation === 'labs.observation.balance_equal'
                ? '#7fe0b3'
                : '#efb959'
            }
            strokeWidth="5"
            transform={`rotate(${visible ? Math.max(-25, Math.min(25, (Number(run.inputs.known_mass) - Number(run.inputs.sliders)) * 3)) : 0} 600 206)`}
          />
        </>
      ) : (
        <>
          {model.graphic === 'burette' && (
            <>
              <rect
                x="437"
                y="20"
                width="26"
                height="100"
                rx="6"
                fill="url(#teaching-glass)"
                stroke="#c3dfec"
                strokeWidth="3"
              />
              <path d="M450 120V130" stroke="#d2e2e9" strokeWidth="5" />
              {active && <circle cx="450" cy="135" r="3" fill="#c4cde7" />}
            </>
          )}
          {model.graphic === 'gas' && (
            <>
              <rect
                x="610"
                y="90"
                width="90"
                height="230"
                rx="10"
                fill="url(#teaching-glass)"
                stroke="#b8d5e4"
                strokeWidth="3"
              />
              <path d="M490 150H655V110" fill="none" stroke="#bfd4e1" strokeWidth="9" />
            </>
          )}
          {model.graphic === 'calorimeter' && (
            <>
              <rect x="310" y="205" width="260" height="145" rx="15" fill="#edf0f2" />
              <rect x="448" y="80" width="15" height="200" rx="6" fill="#dae4e9" />
              <rect
                x="452"
                y={visible ? 120 : 190}
                width="7"
                height={visible ? 160 : 90}
                fill="#d86062"
              />
            </>
          )}
          {model.graphic !== 'calorimeter' && model.graphic !== 'flame' && (
            <>
              <path
                d="M385 140H515V170L545 315Q545 345 515 345H385Q355 345 355 315L385 170Z"
                fill="url(#teaching-glass)"
                stroke="#c7e2ed"
                strokeWidth="3"
              />
              {model.graphic === 'gas' && (
                <rect x="382" y="133" width="136" height="12" rx="4" fill="#263f50" />
              )}
              <path
                d="M373 270H527L537 316Q537 337 512 337H388Q363 337 363 316Z"
                fill={colour}
                opacity=".8"
              />
              {visible &&
                preview &&
                /hydrogen|oxygen|carbonate|ammonia|nitrate/.test(preview.observation) &&
                [0, 1, 2, 3].map((i) => (
                  <circle
                    key={i}
                    className="handbook-lab__bubble"
                    cx={410 + i * 25}
                    cy={280 - i * 23}
                    r={5 + (i % 2)}
                    fill="none"
                    stroke="#e9f6fd"
                    strokeWidth="3"
                  />
                ))}
            </>
          )}
          {model.graphic === 'flame' && (
            <>
              <rect x="395" y="328" width="110" height="18" rx="8" fill="#1f3549" />
              <rect x="437" y="285" width="26" height="50" fill="#b6cbd8" />
              <path
                d="M450 285Q410 245 450 180Q490 245 450 285Z"
                fill={visible ? preview?.colour : '#399ee1'}
              />
              <path d="M285 215H440" stroke="#cadbe5" strokeWidth="5" />
            </>
          )}
          <text x="450" y="395" textAnchor="middle" fill="#f0f8ff" fontSize="20">
            {label}
          </text>
        </>
      )}
      <text x="20" y="475" fill="#e2f1fa" fontSize="15">
        {t('labs.schematic')}
      </text>
    </svg>
  );
}

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
  const [tab, setTab] = useState<'experiment' | 'notebook' | 'report'>('experiment');
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(run?.inputs ?? {}).map(([k, v]) => [k, String(v)])),
  );
  if (!run || !model || !reference) return null;
  const editable = (control: (typeof model.controls)[number]) =>
    !run.completed && (run.step === 0 || !!control.liveAt?.includes(run.step));
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
        <nav className="handbook-lab__tabs" aria-label={t('labs.sections')}>
          {(['experiment', 'notebook', 'report'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'button button--primary' : 'button'}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {t(`labs.tab.${id}`)}
            </button>
          ))}
        </nav>
        <p className="hint-text">{t('labs.local_notice')}</p>
        {i18n.language === 'si' && (
          <p className="hint-text">{t('ui.handbook.translation_draft')}</p>
        )}
        {[7, 8].includes(run.number) && (
          <p className="handbook-lab__precaution">{t('labs.synthetic_notice')}</p>
        )}
        {tab === 'experiment' ? (
          <div className="handbook-lab__grid">
            <section className="handbook-lab__visual">
              <Instrument model={model} run={run} />
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
            <aside className="handbook-lab__controls" aria-label={t('labs.controls')}>
              <p className="badge">{t('labs.available')}</p>
              <p>{t(model.scopeKey)}</p>
              <p className="handbook-lab__precaution">{t(`labs.precaution.${run.number}`)}</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={run.safety}
                  disabled={run.step > 0 || run.completed}
                  onChange={(e) => act({ type: 'safety', value: e.target.checked })}
                />
                {t('labs.safety_ack')}
              </label>
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
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [control.id]: e.target.value }))
                          }
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
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [control.id]: e.target.value }))
                          }
                        />
                      )}
                    </label>
                  ))}
              </fieldset>
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
                    if (act({ type: 'finish' })) setTab('report');
                  }}
                >
                  {t('labs.finish')}
                </button>
              </div>
              <p>{t('labs.trial_count', { count: run.trials.length })}</p>
              {[6, 14, 19, 20].includes(run.number) && (
                <p className="hint-text">{t('labs.three_trials')}</p>
              )}
            </aside>
          </div>
        ) : tab === 'notebook' ? (
          <section className="card handbook-lab__document">
            <h2>{t('labs.tab.notebook')}</h2>
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
            <h2>{t('labs.tab.report')}</h2>
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
      </main>
    </div>
  );
}
