import type { ExperimentDefinition } from '@vlab/contracts';
import type { CatalogEntry } from './adapter';

/** Catalog facts taken directly from the validated, versioned ExperimentDefinition. */
export const bundledCatalogEntry = (definition: ExperimentDefinition): CatalogEntry => ({
  experimentId: definition.experimentId,
  experimentNumber: definition.experimentNumber,
  titleKey: definition.titleKey,
  unitNumber: definition.syllabusUnit.unitNumber,
  unitTitleKey: definition.syllabusUnit.titleKey,
  modes: ['automatic', 'guided', 'manual'],
  locales: ['en', 'si'],
  definitionVersion: definition.definitionVersion,
});
