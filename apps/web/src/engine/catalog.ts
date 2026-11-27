import type { ExperimentDefinition, Mode } from '@vlab/contracts';
import type { CatalogEntry } from './adapter';

/** Catalog facts taken directly from the validated, versioned ExperimentDefinition. */
export const bundledCatalogEntry = (
  definition: ExperimentDefinition,
  /** LAB-011: the modes the practical's engine supports (capability registry). */
  modes: readonly Mode[],
): CatalogEntry => ({
  experimentId: definition.experimentId,
  experimentNumber: definition.experimentNumber,
  titleKey: definition.titleKey,
  unitNumber: definition.syllabusUnit.unitNumber,
  unitTitleKey: definition.syllabusUnit.titleKey,
  modes: [...modes],
  locales: ['en', 'si'],
  definitionVersion: definition.definitionVersion,
});
