import type {
  ActionEnvelope,
  AssessmentDefinition,
  ExperimentDefinition,
  Mode,
  SessionInit,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import {
  createInitialState as createStandardSolutionState,
  transition as transitionStandardSolution,
  type TransitionResult,
} from './handlers/standardSolutionEngine';

export type ExperimentKind = ExperimentDefinition['kind'];

export interface ExperimentCapabilities {
  readonly automatic: boolean;
  readonly guided: boolean;
  readonly manual: boolean;
  readonly procedure: boolean;
  readonly guidance: boolean;
  readonly assessment: boolean;
  readonly publicProjection: boolean;
  readonly versionCompatibility: boolean;
}

export interface ExperimentHandler {
  readonly kind: ExperimentKind;
  readonly capabilities: ExperimentCapabilities;
  validateCompatibility(
    definition: ExperimentDefinition,
    assessment: AssessmentDefinition,
  ): readonly string[];
  supportsMode(mode: Mode): boolean;
  createInitialState(init: SessionInit, context: SimulationContext): SimulationState;
  transition(
    state: SimulationState,
    envelope: ActionEnvelope,
    context: SimulationContext,
  ): TransitionResult;
}

export class UnknownExperimentKindError extends Error {
  constructor(kind: string) {
    super(`Unknown experiment kind: ${kind}`);
    this.name = 'UnknownExperimentKindError';
  }
}

export class IncompatibleExperimentError extends Error {
  constructor(issues: readonly string[]) {
    super(`Incompatible experiment definition: ${issues.join('; ')}`);
    this.name = 'IncompatibleExperimentError';
  }
}

const standardSolutionHandler: ExperimentHandler = {
  kind: 'standard_solution_by_mass',
  capabilities: {
    automatic: true,
    guided: true,
    manual: true,
    procedure: true,
    guidance: true,
    assessment: true,
    publicProjection: true,
    versionCompatibility: true,
  },
  validateCompatibility(definition, assessment) {
    const issues: string[] = [];
    if (definition.kind !== this.kind) issues.push(`kind must be ${this.kind}`);
    if (definition.experimentId !== assessment.experimentId)
      issues.push('definition and assessment experiment IDs differ');
    if (definition.assessmentRef.assessmentId !== assessment.assessmentId)
      issues.push('definition and assessment IDs differ');
    if (definition.assessmentRef.version !== assessment.version)
      issues.push('definition assessment version differs from supplied assessment');
    return issues;
  },
  supportsMode(mode) {
    return mode === 'automatic' || mode === 'guided' || mode === 'manual';
  },
  createInitialState(init, context) {
    return createStandardSolutionState(init, context);
  },
  transition(state, envelope, context) {
    return transitionStandardSolution(state, envelope, context);
  },
};

const handlers = new Map<ExperimentKind, ExperimentHandler>([
  [standardSolutionHandler.kind, standardSolutionHandler],
]);

export const registeredExperimentKinds = (): readonly ExperimentKind[] => [...handlers.keys()];

export const handlerFor = (kind: string): ExperimentHandler => {
  const handler = handlers.get(kind as ExperimentKind);
  if (!handler) throw new UnknownExperimentKindError(kind);
  return handler;
};

export const handlerForContext = (context: SimulationContext): ExperimentHandler => {
  const handler = handlerFor(context.definition.kind);
  const issues = handler.validateCompatibility(context.definition, context.assessment);
  if (issues.length > 0) throw new IncompatibleExperimentError(issues);
  return handler;
};

export const validateHandlerCompatibility = (
  context: SimulationContext,
  mode?: Mode,
): ExperimentHandler => {
  const handler = handlerForContext(context);
  if (mode && !handler.supportsMode(mode))
    throw new IncompatibleExperimentError([`mode ${mode} is unsupported for ${handler.kind}`]);
  return handler;
};
