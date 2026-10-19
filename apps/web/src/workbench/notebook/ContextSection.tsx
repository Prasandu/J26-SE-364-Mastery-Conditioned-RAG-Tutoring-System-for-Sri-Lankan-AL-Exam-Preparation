import { useTranslation } from 'react-i18next';
import { SourceList } from '../../components/SourceList';
import { definition } from '../../engine/content';

/**
 * Notebook "Context" section: the aims, required theory and preparation calculations already
 * shown on the pre-lab page, read directly from the approved experiment definition. Reference
 * content only — nothing here is student state, so there is nothing to preserve or duplicate.
 */
export function ContextSection() {
  const { t } = useTranslation();
  const aims = definition.learningObjectives.filter((o) => o.id.startsWith('aim_'));

  return (
    <>
      <h3>{t('ui.overview.aims')}</h3>
      <ul>
        {aims.map((o) => (
          <li key={o.id}>{t(o.textKey)}</li>
        ))}
      </ul>
      <h3>{t('ui.prelab.theory')}</h3>
      <ul>
        {definition.prerequisites.map((p) => (
          <li key={p.id}>{t(p.textKey)}</li>
        ))}
      </ul>
      <ol className="calculation">
        {definition.expectedResults.calculations.map((c) => (
          <li key={c.id}>{t(c.stepKey)}</li>
        ))}
      </ol>
      <SourceList
        refs={[
          ...definition.prerequisites.flatMap((p) => p.sourceRefs),
          ...definition.expectedResults.calculations.flatMap((c) => c.result.sourceRefs),
        ]}
      />
    </>
  );
}
