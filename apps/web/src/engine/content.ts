import {
  AssessmentDefinitionSchema,
  ExperimentDefinitionSchema,
  SourceRegistrySchema,
} from '@vlab/contracts';
import assessmentJson from '../../../../content/experiments/exp04/assessment.v1.json';
import definitionJson from '../../../../content/experiments/exp04/definition.v1.json';
import sourcesJson from '../../../../content/sources.v1.json';

/** Versioned content, validated at load. Invalid content fails fast instead of rendering wrong chemistry. */
export const definition = ExperimentDefinitionSchema.parse(definitionJson);
export const assessment = AssessmentDefinitionSchema.parse(assessmentJson);
export const sources = SourceRegistrySchema.parse(sourcesJson);
