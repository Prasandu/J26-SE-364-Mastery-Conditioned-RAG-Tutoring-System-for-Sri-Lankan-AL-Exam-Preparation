import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { FlowSteps } from '../components/FlowSteps';
import { SourceList } from '../components/SourceList';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { definition } from '../engine/content';
import { formatQuantity } from '../lib/format';
import { useSession } from '../store/StoreProvider';

/** Keep exact citations available without repeating long document titles in the reading flow. */
function OverviewSources({ refs }: ComponentProps<typeof SourceList>) {
  const { t } = useTranslation();
  return (
    <details className="overview-sources">
      <summary>{t('ui.overview.sources')}</summary>
      <SourceList refs={refs} />
    </details>
  );
}

/** Ordered preparation guide; chemistry and provenance come from the versioned definition. */
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
      <PageHeader
        id="overview-title"
        eyebrow={t(definition.syllabusUnit.titleKey)}
        title={t(definition.titleKey)}
        lead={t('ui.overview.lead')}
      />
      <FlowSteps current="overview" />

      <section className="card overview-intro" aria-labelledby="ov-aims">
        <div className="overview-intro__target">
          <span className="target-banner__icon">
            <Icon name="flask" size={28} />
          </span>
          <h2 id="ov-target">{t('ui.overview.target')}</h2>
          <p className="target-line">
            {formatQuantity(e.targetVolume.quantity, locale)} ·{' '}
            {formatQuantity(e.targetConcentration.quantity, locale)} · Na₂CO₃
          </p>
        </div>
        <div className="overview-intro__aims">
          <h2 id="ov-aims" className="card__title">
            <span className="overview-number" aria-hidden="true">
              1
            </span>{' '}
            {t('ui.overview.aims')}
          </h2>
          <ul className="tick-list">
            {aims.map((o) => (
              <li key={o.id}>{t(o.textKey)}</li>
            ))}
          </ul>
          <details className="overview-disclosure">
            <summary>{t('ui.overview.outcomes')}</summary>
            <ul className="tick-list">
              {outcomes.map((o) => (
                <li key={o.id}>{t(o.textKey)}</li>
              ))}
            </ul>
            <SourceList refs={outcomes.flatMap((o) => o.sourceRefs)} />
          </details>
          <OverviewSources refs={aims.flatMap((o) => o.sourceRefs)} />
        </div>
      </section>

      <div className="overview-preparation">
        <section className="card" aria-labelledby="ov-materials">
          <h2 id="ov-materials" className="card__title">
            <span className="overview-number" aria-hidden="true">
              2
            </span>{' '}
            {t('ui.overview.materials')}
          </h2>
          <h3 id="ov-apparatus">{t('ui.overview.apparatus')}</h3>
          <ul className="overview-apparatus" aria-labelledby="ov-apparatus">
            {apparatus.map((a) => (
              <li key={a.id}>
                <Icon name="check" size={14} />
                <span>
                  {t(a.nameKey)}{' '}
                  {a.role === 'optional' && (
                    <span className="tag">{t('ui.overview.optional')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="overview-chemical">
            <h3 id="ov-chemical">
              <Icon name="layers" size={16} /> {t('ui.overview.chemical')}
            </h3>
            {solute && (
              <p>
                {t(solute.nameKey)}
                {solute.molarMass && (
                  <> — M = {formatQuantity(solute.molarMass.quantity, locale)}</>
                )}
              </p>
            )}
          </div>
          <OverviewSources
            refs={[...apparatus.flatMap((a) => a.sourceRefs), ...(solute?.sourceRefs ?? [])]}
          />
        </section>

        <section className="card overview-calculation" aria-labelledby="ov-calc">
          <h2 id="ov-calc" className="card__title">
            <span className="overview-number" aria-hidden="true">
              3
            </span>{' '}
            {t('ui.overview.calculation')}
          </h2>
          <details className="overview-disclosure">
            <summary id="ov-knowledge">{t('ui.overview.knowledge')}</summary>
            <ul>
              {definition.prerequisites.map((p) => (
                <li key={p.id}>{t(p.textKey)}</li>
              ))}
            </ul>
            <SourceList refs={definition.prerequisites.flatMap((p) => p.sourceRefs)} />
          </details>
          <ol className="calculation">
            {e.calculations.map((c) => (
              <li key={c.id}>{t(c.stepKey)}</li>
            ))}
          </ol>
          <OverviewSources refs={e.calculations.flatMap((c) => c.result.sourceRefs)} />
        </section>
      </div>

      <section className="card card--safety overview-safety" aria-labelledby="ov-safety">
        <h2 id="ov-safety" className="card__title">
          <span className="overview-number" aria-hidden="true">
            4
          </span>{' '}
          {t('ui.overview.safety')}
        </h2>
        <ul>
          {definition.safetyRules.map((r) => (
            <li key={r.id}>{t(r.textKey)}</li>
          ))}
        </ul>
        <OverviewSources refs={definition.safetyRules.flatMap((r) => r.sourceRefs)} />
      </section>

      <nav className="view-nav" aria-label={t('ui.nav.steps')}>
        <button type="button" className="button" onClick={() => navigate('library')}>
          {t('ui.nav.back_library')}
        </button>
        <button type="button" className="button button--primary" onClick={() => navigate('prelab')}>
          {t('ui.nav.to_prelab')} <Icon name="arrow" size={18} />
        </button>
      </nav>
    </section>
  );
}
