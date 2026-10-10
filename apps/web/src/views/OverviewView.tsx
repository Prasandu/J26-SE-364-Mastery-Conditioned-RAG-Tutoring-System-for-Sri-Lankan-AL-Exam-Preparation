import { useTranslation } from 'react-i18next';
import { SourceList } from '../components/SourceList';
import { definition } from '../engine/content';
import { formatQuantity } from '../lib/format';
import { useSession } from '../store/StoreProvider';

/** Experiment overview rendered entirely from the versioned ExperimentDefinition. */
export function OverviewView() {
  const { t } = useTranslation();
  const locale = useSession((s) => s.locale);
  const navigate = useSession((s) => s.navigate);
  const e = definition.expectedResults;
  const aims = definition.learningObjectives.filter((o) => o.id.startsWith('aim_'));
  const outcomes = definition.learningObjectives.filter((o) => !o.id.startsWith('aim_'));
  const apparatus = definition.apparatus.filter((a) => a.role !== 'distractor');
  const solute = definition.chemicals.find((c) => c.id === e.soluteChemicalId);

  return (
    <section className="view view--overview" aria-labelledby="overview-title">
      <h1 id="overview-title">{t(definition.titleKey)}</h1>
      <p className="lead">{t(definition.syllabusUnit.titleKey)}</p>

      <div className="two-column">
        <section className="card" aria-labelledby="ov-aims">
          <h2 id="ov-aims">{t('ui.overview.aims')}</h2>
          <ul>
            {aims.map((o) => (
              <li key={o.id}>{t(o.textKey)}</li>
            ))}
          </ul>
          <SourceList refs={aims.flatMap((o) => o.sourceRefs)} />
          <h3>{t('ui.overview.outcomes')}</h3>
          <ul>
            {outcomes.map((o) => (
              <li key={o.id}>{t(o.textKey)}</li>
            ))}
          </ul>
          <SourceList refs={outcomes.flatMap((o) => o.sourceRefs)} />
        </section>

        <section className="card card--target" aria-labelledby="ov-target">
          <h2 id="ov-target">{t('ui.overview.target')}</h2>
          <p className="target-line">
            {formatQuantity(e.targetVolume.quantity, locale)} ·{' '}
            {formatQuantity(e.targetConcentration.quantity, locale)} · Na₂CO₃
          </p>
          <ol className="calculation">
            {e.calculations.map((c) => (
              <li key={c.id}>{t(c.stepKey)}</li>
            ))}
          </ol>
          <SourceList refs={e.calculations.flatMap((c) => c.result.sourceRefs)} />
        </section>
      </div>

      <section className="card" aria-labelledby="ov-knowledge">
        <h2 id="ov-knowledge">{t('ui.overview.knowledge')}</h2>
        <ul>
          {definition.prerequisites.map((p) => (
            <li key={p.id}>{t(p.textKey)}</li>
          ))}
        </ul>
        <SourceList refs={definition.prerequisites.flatMap((p) => p.sourceRefs)} />
      </section>

      <div className="two-column">
        <section className="card" aria-labelledby="ov-apparatus">
          <h2 id="ov-apparatus">{t('ui.overview.apparatus')}</h2>
          <ul>
            {apparatus.map((a) => (
              <li key={a.id}>
                {t(a.nameKey)}
                {a.role === 'optional' && <span className="tag">{t('ui.overview.optional')}</span>}
              </li>
            ))}
          </ul>
          <SourceList refs={apparatus.flatMap((a) => a.sourceRefs)} />
        </section>
        <section className="card" aria-labelledby="ov-chemical">
          <h2 id="ov-chemical">{t('ui.overview.chemical')}</h2>
          {solute && (
            <p>
              {t(solute.nameKey)}
              {solute.molarMass && <> — M = {formatQuantity(solute.molarMass.quantity, locale)}</>}
            </p>
          )}
          <SourceList refs={solute?.sourceRefs ?? []} />
        </section>
      </div>

      <section className="card card--safety" aria-labelledby="ov-safety">
        <h2 id="ov-safety">{t('ui.overview.safety')}</h2>
        <ul>
          {definition.safetyRules.map((r) => (
            <li key={r.id}>{t(r.textKey)}</li>
          ))}
        </ul>
        <SourceList refs={definition.safetyRules.flatMap((r) => r.sourceRefs)} />
      </section>

      <nav className="view-nav" aria-label={t('ui.nav.steps')}>
        <button type="button" className="button" onClick={() => navigate('library')}>
          {t('ui.nav.back_library')}
        </button>
        <button type="button" className="button button--primary" onClick={() => navigate('prelab')}>
          {t('ui.nav.to_prelab')}
        </button>
      </nav>
    </section>
  );
}
