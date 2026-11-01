import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { useSession } from '../../store/StoreProvider';

/**
 * Notebook "Summary" section: a compact, honest completion status plus the real deterministic
 * score once the engine has produced one, with a link to the full report (deductions, measured
 * values, safety warnings) rather than duplicating that detail here. Shows nothing invented —
 * before submission there is no score to show, so none is shown.
 */
export function SummarySection() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const report = useSession((s) => s.report);
  const loadReport = useSession((s) => s.loadReport);
  const navigate = useSession((s) => s.navigate);
  const submitted = session?.status === 'submitted';

  useEffect(() => {
    if (submitted && report.status === 'idle') void loadReport();
  }, [submitted, report.status, loadReport]);

  if (!submitted) {
    return (
      <StatusMessage tone="info" title={t('ui.summary.not_submitted_title')}>
        <p>{t('ui.summary.not_submitted_text')}</p>
      </StatusMessage>
    );
  }

  if (report.status !== 'ready' || !report.data) {
    return (
      <StatusMessage
        tone={report.status === 'error' ? 'error' : 'loading'}
        title={t(`ui.report.status.${report.status === 'idle' ? 'loading' : report.status}`)}
      />
    );
  }

  const r = report.data;

  return (
    <>
      <p className="report__label">
        {t('ui.report.result_label')}:{' '}
        <strong>{r.overall === null ? '—' : `${r.overall} / 100`}</strong>
      </p>
      <p className="hint-text">{t(`ui.report.completion_${r.completion}`)}</p>
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
      <p className="notice" role="note">
        {t(r.disclaimerKey)}
      </p>
      <button type="button" className="button button--primary" onClick={() => navigate('report')}>
        {t('ui.summary.open_full_report')}
      </button>
    </>
  );
}
