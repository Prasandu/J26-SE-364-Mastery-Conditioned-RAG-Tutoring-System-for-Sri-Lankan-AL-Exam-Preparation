import type {
  AssessmentDefinition,
  ExperimentDefinition,
  GuidanceProfile,
  Parameter,
  SessionMeta,
} from '@vlab/contracts';

export interface SimulationContext {
  readonly definition: ExperimentDefinition;
  readonly assessment: AssessmentDefinition;
}

export type Binding = keyof AssessmentDefinition['bindings'];

export class MissingParameterError extends Error {
  constructor(parameterId: string, expected: string) {
    super(`Assessment parameter ${parameterId} missing or not a ${expected}`);
    this.name = 'MissingParameterError';
  }
}

const indexCache = new WeakMap<AssessmentDefinition, Map<string, Parameter>>();

const lookup = (ctx: SimulationContext, parameterId: string): Parameter['value'] | undefined => {
  let index = indexCache.get(ctx.assessment);
  if (!index) {
    index = new Map(ctx.assessment.parameters.map((p) => [p.parameterId, p]));
    indexCache.set(ctx.assessment, index);
  }
  return index.get(parameterId)?.value;
};

export const paramNumber = (ctx: SimulationContext, parameterId: string): number => {
  const v = lookup(ctx, parameterId);
  if (typeof v !== 'number') throw new MissingParameterError(parameterId, 'number');
  return v;
};

export const paramRange = (
  ctx: SimulationContext,
  parameterId: string,
): { min: number; max: number } => {
  const v = lookup(ctx, parameterId);
  if (!v || typeof v !== 'object') throw new MissingParameterError(parameterId, 'range');
  return v;
};

export const paramString = (ctx: SimulationContext, parameterId: string): string => {
  const v = lookup(ctx, parameterId);
  if (typeof v !== 'string') throw new MissingParameterError(parameterId, 'string');
  return v;
};

export const bound = (ctx: SimulationContext, key: Binding): string => ctx.assessment.bindings[key];
export const boundNumber = (ctx: SimulationContext, key: Binding): number =>
  paramNumber(ctx, bound(ctx, key));

export const profileOf = (meta: Pick<SessionMeta, 'mode' | 'guidanceLevel'>): GuidanceProfile =>
  meta.mode === 'guided' ? `guided_${meta.guidanceLevel ?? 'beginner'}` : meta.mode;

export const safetyPolicy = (
  ctx: SimulationContext,
  meta: Pick<SessionMeta, 'mode' | 'guidanceLevel'>,
): 'confirm' | 'warn' => {
  const id = ctx.assessment.safetyPolicy[profileOf(meta)];
  const policy = paramString(ctx, id);
  if (policy !== 'confirm' && policy !== 'warn') throw new MissingParameterError(id, 'policy');
  return policy;
};
