import type { Deduction } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SourceList } from '../components/SourceList';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import { formatQuantity, formatSeconds } from '../lib/format';
import { useSession } from '../store/StoreProvider';

/**
 * Evidence-based practical report, built by the engine (server-side in API mode). Manual-mode
 * mistakes and hidden calculated results are revealed here and only here.
 */
function DeductionItem({ d }: { d: Deduction }) {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const isErrorCode = d.reason === d.reason.toUpperCase();
  const label = isErrorCode
    ? t(`exp04.error.${d.reason.toLowerCase()}.message`)
    : t(`ui.report.reason.${d.reason}`);
  const evidence = d.eventSeqs.map((seq) => {
    const e = session?.events.find((x) => x.seq === seq);
    return e ? `#${seq} ${t(`exp04.action.${e.actionType}`)}` : `#${seq}`;
  });
  return (
    <li className="deduction">
      <p>
        <span className="deduction__points">−{d.points}</span> {label}
        {d.resolved && <span className="tag tag--ok">{t('ui.report.corrected')}</span>}
      </p>
      {isErrorCode && (
        <p className="hint-text">{t(`exp04.error.${d.reason.toLowerCase()}.explanation`)}</p>
      )}
      <p className="evidence">
        <span className="label">{t('ui.report.evidence')}</span> {evidence.join('; ')}
      </p>
      <p className="assumption">
        <span className="label">{t('ui.report.assumption_label')}</span> {d.parameterIds.join(', ')}
      </p>
      <SourceList refs={d.sourceRefs} />
    </li>
  );
}

export function ReportView() {
  const { t } = useTranslation();
  const locale = useSession((s) => s.locale);
  const report = useSession((s) => s.report);
  const engine = useSession((s) => s.engine);
  const load = useSession((s) => s.loadReport);
  const session = useSession((s) => s.session);
  const log = useSession((s) => s.log);

  const header = (
    <header className="workbench__bar">
      <div className="workbench__heading">
        <p className="page-header__eyebrow">{t(engine.definition.titleKey)}</p>
        <h1 id="report-title">{t('ui.report.title')}</h1>
      </div>
    </header>
  );
  if (report.status !== 'ready' || !report.data) {
    return (
      <section className="view" aria-labelledby="report-title">
        {header}
        <ConnectionBanner />
        <StatusMessage
          tone={
            report.status === 'error' ? 'error' : report.status === 'loading' ? 'loading' : 'info'
          }
          title={t(`ui.report.status.${report.status}`)}
          action={
            report.status === 'error' ? (
              <button type="button" className="button" onClick={() => void load()}>
                {t('ui.connection.retry')}
              </button>
            ) : undefined
          }
        />
      </section>
    );
  }
  const r = report.data;
  const m = r.measurements;
  const events = session?.events ?? [];
  // Safety messages already shown live during the session (always visible), de-duplicated.
  const safetyWarnings = [
    ...new Set(log.filter((l) => l.kind === 'safety').map((l) => l.messageKey)),
  ];
  const e4 = engine.definition.expectedResults;
  // A provisional parameter changed a numeric result (e.g. residue or parallax), not just a threshold.
  const provisionalEffect = [...r.errorSummary.unresolved, ...r.errorSummary.recovered].some(
    (e) => {
      const rule = engine.definition.errorRules.find((x) => x.code === e.code);
      return !!rule && rule.parameterIds.length > 0 && rule.consequence.startsWith('numeric');
    },
  );

  return (
    <section className="view view--report" aria-labelledby="report-title">
      {header}
      <section className="report-summary" aria-label={t('ui.report.summary')}>
        <div className="report-summary__overall">
          <p className="report__label">
            {t('ui.report.result_label')}:{' '}
            <strong>{r.overall === null ? '—' : `${r.overall} / 100`}</strong>
          </p>
          <p className="report-summary__completion">{t(`ui.report.completion_${r.completion}`)}</p>
        </div>
        <ul className="score-tiles">
          {r.categories.map((c) => (
            <li key={c.category} className="score-tile">
              <span className="score-tile__label">{t(`ui.report.category.${c.category}`)}</span>
              <span className="score-tile__value">
                {c.score === null ? t('ui.report.not_assessed') : `${c.score} / 100`}
              </span>
              {c.score !== null && (
                <span className="meter" aria-hidden="true">
                  <span className="meter__fill" style={{ width: `${c.score}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="notice" role="note">
        {t(r.disclaimerKey)}
      </p>
      <dl className="report__meta">
        <dt>{t('ui.report.experiment')}</dt>
        <dd>
          {t(engine.definition.titleKey)} (v{r.definitionVersion},{' '}
          {t('ui.report.assessment_version', { version: r.assessmentVersion })})
        </dd>
        <dt>{t('ui.report.mode')}</dt>
        <dd>
          {t(`ui.mode.${r.mode}.title`)}
          {r.guidanceLevel ? ` · ${t(`ui.level.${r.guidanceLevel}.title`)}` : ''}
        </dd>
        <dt>{t('ui.report.completion')}</dt>
        <dd>{t(`ui.report.completion_${r.completion}`)}</dd>
        <dt>{t('ui.report.counts')}</dt>
        <dd>
          {t('ui.report.counts_value', {
            hints: r.hints,
            retries: r.retries,
            seconds: Math.round(r.elapsedMs / 1e3),
          })}
        </dd>
      </dl>

      <section className="card" aria-labelledby="rep-results">
        <h2 id="rep-results">{t('ui.report.results')}</h2>
        <table className="report-table">
          <tbody>
            <tr>
              <th scope="row">
                {t('ui.report.target')} <span className="tag">{t('ui.report.kind.source')}</span>
              </th>
              <td>
                {formatQuantity(m.targetConcentration, locale)}
                <SourceList refs={e4.targetConcentration.sourceRefs} />
              </td>
            </tr>
            <tr>
              <th scope="row">
                {t('exp04.measurement.weighed_solute_mass')}{' '}
                <span className="tag">{t('ui.report.kind.measured')}</span>
              </th>
              <td>{m.weighedMass ? formatQuantity(m.weighedMass, locale) : '—'}</td>
            </tr>
            <tr>
              <th scope="row">
                {t('exp04.measurement.transferred_solute_mass')}{' '}
                <span className="tag">{t('ui.report.kind.calculated')}</span>
              </th>
              <td>{formatQuantity(m.transferredMass, locale, 3)}</td>
            </tr>
            <tr>
              <th scope="row">
                {t('exp04.measurement.final_volume')}{' '}
                <span className="tag">{t('ui.report.kind.calculated')}</span>
              </th>
              <td>{m.finalVolume ? formatQuantity(m.finalVolume, locale, 2) : '—'}</td>
            </tr>
            <tr>
              <th scope="row">
                {t('exp04.measurement.achieved_concentration')}{' '}
                <span className="tag">{t('ui.report.kind.calculated')}</span>
              </th>
              <td>
                {m.achievedConcentration
                  ? formatQuantity(m.achievedConcentration, locale, 4)
                  : t(`ui.report.unavailable.${m.concentrationUnavailableReason ?? 'not_made_up'}`)}
              </td>
            </tr>
            <tr>
              <th scope="row">{t('ui.report.absolute_error')}</th>
              <td>{m.absoluteError ? formatQuantity(m.absoluteError, locale, 4) : '—'}</td>
            </tr>
            <tr>
              <th scope="row">{t('ui.report.relative_error')}</th>
              <td>{m.relativeError === null ? '—' : `${(m.relativeError * 100).toFixed(2)} %`}</td>
            </tr>
          </tbody>
        </table>
        {provisionalEffect && (
          <p className="provisional-note">{t('ui.measurements.provisional')}</p>
        )}
      </section>

      <section className="card" aria-labelledby="rep-scores">
        <h2 id="rep-scores">{t('ui.report.scores')}</h2>
        {r.categories.map((c) => (
          <section key={c.category} className="score" aria-labelledby={`score-${c.category}`}>
            <h3 id={`score-${c.category}`}>
              {t(`ui.report.category.${c.category}`)}:{' '}
              {c.score === null ? t('ui.report.not_assessed') : `${c.score} / 100`}
            </h3>
            {c.score !== null && (
              <progress max={100} value={c.score} aria-labelledby={`score-${c.category}`} />
            )}
            {c.deductions.length === 0 ? (
              <p className="hint-text">{t('ui.report.no_deductions')}</p>
            ) : (
              <ul className="deductions">
                {c.deductions.map((d, i) => (
                  <DeductionItem key={`${d.reason}-${i}`} d={d} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </section>

      <section className="card" aria-labelledby="rep-errors">
        <h2 id="rep-errors">{t('ui.report.errors')}</h2>
        <h3>{t('ui.report.unresolved')}</h3>
        {r.errorSummary.unresolved.length === 0 ? (
          <p className="hint-text">{t('ui.report.none')}</p>
        ) : (
          <ul>
            {r.errorSummary.unresolved.map((e) => (
              <li key={`${e.code}-${e.seq}`}>
                {t(`exp04.error.${e.code.toLowerCase()}.message`)}
                {e.recoverability === 'restart_required' && (
                  <span className="tag tag--warning">{t('ui.report.restart_required')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <h3>{t('ui.report.recovered')}</h3>
        {r.errorSummary.recovered.length === 0 ? (
          <p className="hint-text">{t('ui.report.none')}</p>
        ) : (
          <ul>
            {r.errorSummary.recovered.map((e) => (
              <li key={`${e.code}-${e.raisedSeq}`}>
                {t(`exp04.error.${e.code.toLowerCase()}.message`)}
              </li>
            ))}
          </ul>
        )}
        {r.validity.purityRisks.length > 0 && (
          <p className="text-warning">{t('ui.canvas.warning')}</p>
        )}
      </section>

      <section className="card" aria-labelledby="rep-actions">
        <h2 id="rep-actions" className="card__title">
          <Icon name="clipboard" /> {t('ui.report.actions')}
        </h2>
        <p className="hint-text">{t('ui.report.actions_help')}</p>
        {events.length === 0 ? (
          <p className="hint-text">{t('ui.log.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table className="report-table report-table--actions">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t('ui.report.col_action')}</th>
                  <th scope="col">{t('ui.report.col_outcome')}</th>
                  <th scope="col">{t('ui.report.col_observations')}</th>
                  <th scope="col">{t('ui.report.col_time')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.seq} className={e.accepted ? undefined : 'is-rejected'}>
                    <td>{e.seq}</td>
                    <td>
                      {t(`exp04.action.${e.actionType}`)}
                      {e.actor === 'system' && (
                        <span className="tag">{t('ui.log.actor.system')}</span>
                      )}
                    </td>
                    <td>{t(e.accepted ? 'ui.log.accepted' : 'ui.log.rejected')}</td>
                    <td>
                      {[
                        ...e.observations.map((o) => t(`exp04.observation.${o}`)),
                        ...e.measurements.map(
                          (mm) =>
                            `${t(`exp04.measurement.${mm.id}`)}: ${formatQuantity(mm.quantity, locale)}`,
                        ),
                      ].join(' · ') || '—'}
                    </td>
                    <td>{t('ui.log.seconds', { seconds: formatSeconds(e.elapsedMs, locale) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>{t('ui.report.safety_warnings')}</h3>
        {safetyWarnings.length === 0 ? (
          <p className="hint-text">{t('ui.report.none')}</p>
        ) : (
          <ul className="warning-list">
            {safetyWarnings.map((key) => (
              <li key={key}>
                <Icon name="alert" size={16} /> {t(key)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="rep-assumptions">
        <h2 id="rep-assumptions">{t('ui.report.assumptions')}</h2>
        <p className="hint-text">{t('ui.report.assumptions_help')}</p>
        <ul className="parameter-list">
          {r.provisionalParameterIds.map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
        </ul>
        <h3>{t('ui.report.sources')}</h3>
        <SourceList refs={r.sourceRefs} />
      </section>

      <button type="button" className="button no-print" onClick={() => window.print()}>
        {t('ui.report.print')}
      </button>
    </section>
  );
}
