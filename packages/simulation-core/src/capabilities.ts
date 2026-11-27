/**
 * LAB-011: one versioned statement, per practical, of what its simulation actually supports.
 *
 * Nothing here is hand-written next to the engines: every entry is derived from the engine
 * that runs the practical (the Experiment 4 definition and handler, the bounded handbook
 * models, the teaching templates). Observations and calculated readings of the handbook
 * models are found by running their own deterministic calculation over their choices.
 * Results always come from that engine; no generative model may supply or alter them.
 */
import type {
  AssessmentDefinition,
  ExperimentDefinition,
  GuidanceLevel,
  Mode,
  TeachingDefinition,
} from '@vlab/contracts';
import library from '../../../content/library/handbook-first20.v1.json';
import preparation from '../../../content/library/handbook-preparation.v1.json';
import { calculateHandbook, handbookModels, type HandbookModel } from './handbookLab';
import { handlerFor } from './registry';

export const CAPABILITY_REGISTRY_VERSION = '1.0.0';

const ALL_MODES: readonly Mode[] = ['automatic', 'guided', 'manual'];
const ALL_LEVELS: readonly GuidanceLevel[] = ['beginner', 'intermediate', 'advanced'];
const MAX_COMBINATIONS = 512;

export type PracticalEngine = 'full_engine' | 'bounded_model' | 'teaching_template';

/** Each code has a `capability.unsupported.<code>` text in both locales. */
export type UnsupportedFeature =
  | 'automatic_mode'
  | 'manual_mode'
  | 'guidance_levels'
  | 'competency_estimate'
  | 'written_answer_checking'
  | 'server_session'
  | 'itemised_apparatus'
  | 'predicted_measurements';

export interface PracticalCapability {
  registryVersion: typeof CAPABILITY_REGISTRY_VERSION;
  experimentNumber: number;
  engine: PracticalEngine;
  /** The content/engine version the entry was derived from. */
  engineVersion: string;
  modes: readonly Mode[];
  guidanceLevels: readonly GuidanceLevel[];
  /** Stable identifiers or text keys into the practical's own content. */
  objectives: readonly string[];
  apparatus: readonly string[];
  chemicals: readonly string[];
  actions: readonly string[];
  inputs: readonly string[];
  safety: readonly string[];
  calculations: readonly string[];
  observations: readonly string[];
  assessment: {
    competencyEstimate: boolean;
    writtenAnswers: 'guide_check' | 'teacher_review';
    report: boolean;
    preLabQuestions: number;
    postLabQuestions: number;
  };
  unsupported: readonly UnsupportedFeature[];
  /** A text key (bounded models) or the definition's own limitation text (teaching). */
  limitation: { key: string } | { text: { en: string; si: string } } | null;
  handbookPages: readonly number[];
  results: 'deterministic_engine';
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);

function modeGaps(modes: readonly Mode[], levels: readonly GuidanceLevel[]): UnsupportedFeature[] {
  return [
    ...(modes.includes('automatic') ? [] : (['automatic_mode'] as const)),
    ...(modes.includes('manual') ? [] : (['manual_mode'] as const)),
    ...(levels.length > 1 ? [] : (['guidance_levels'] as const)),
  ];
}

const BOUNDED_GAPS: readonly UnsupportedFeature[] = [
  'competency_estimate',
  'written_answer_checking',
  'server_session',
  'predicted_measurements',
];

/** Experiment 4 and any later practical built on a registered ExperimentDefinition handler. */
export function capabilityForDefinition(
  definition: ExperimentDefinition,
  assessment: AssessmentDefinition,
): PracticalCapability {
  const handler = handlerFor(definition.kind);
  const modes = ALL_MODES.filter((mode) => handler.supportsMode(mode));
  const levels = handler.capabilities.guidance && modes.includes('guided') ? ALL_LEVELS : [];
  return {
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    experimentNumber: definition.experimentNumber,
    engine: 'full_engine',
    engineVersion: `${definition.experimentId}@${definition.definitionVersion}+${assessment.assessmentId}@${assessment.version}`,
    modes,
    guidanceLevels: levels,
    objectives: definition.learningObjectives.map((o) => o.id),
    apparatus: definition.apparatus.map((a) => a.id),
    chemicals: definition.chemicals.map((c) => c.id),
    actions: unique(definition.availableActions.map((a) => a.type)),
    inputs: [],
    safety: definition.safetyRules.map((rule) => rule.id),
    calculations: definition.measurementRules.map((rule) => rule.id),
    observations: definition.observations.map((o) => o.id),
    assessment: {
      competencyEstimate: handler.capabilities.assessment,
      writtenAnswers: 'guide_check',
      report: handler.capabilities.assessment,
      preLabQuestions: definition.preLabQuestions.length,
      postLabQuestions: definition.postLabQuestions.length,
    },
    unsupported: [
      ...modeGaps(modes, levels),
      ...(handler.capabilities.assessment ? [] : (['competency_estimate'] as const)),
    ],
    limitation: null,
    handbookPages: handbookPagesCited(definition),
    results: 'deterministic_engine',
  };
}

/** Every handbook PDF page cited anywhere in a definition (aims, safety, actions, rules...). */
function handbookPagesCited(definition: ExperimentDefinition): number[] {
  const pages = new Set<number>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (
        typeof record.sourceId === 'string' &&
        record.sourceId.includes('handbook') &&
        typeof record.pdfPage === 'number'
      )
        pages.add(record.pdfPage);
      Object.values(record).forEach(visit);
    }
  };
  visit(definition);
  return sorted([...pages]);
}

/** Every choice combination (numbers at their starting value), capped for safety. */
function choiceCombinations(model: HandbookModel): Record<string, string | number>[] {
  let combos: Record<string, string | number>[] = [
    Object.fromEntries(model.controls.map((c) => [c.id, c.initial])),
  ];
  for (const control of model.controls) {
    if (!control.options) continue;
    combos = combos.flatMap((combo) =>
      control.options!.map((option) => ({ ...combo, [control.id]: option })),
    );
    if (combos.length > MAX_COMBINATIONS)
      throw new Error(`model ${model.number} has too many choices`);
  }
  return combos;
}

export function capabilityForHandbookModel(model: HandbookModel): PracticalCapability {
  const observations = new Set<string>();
  const calculations = new Set<string>();
  let refused = 0;
  for (const inputs of choiceCombinations(model)) {
    let result;
    try {
      result = calculateHandbook(model.number, inputs);
    } catch {
      refused += 1; // the engine refuses this combination (e.g. sodium with dilute acid)
      continue;
    }
    observations.add(result.observation);
    result.readings.forEach((reading) => calculations.add(reading.label));
  }
  const entry = library.entries.find((e) => e.experimentNumber === model.number);
  const questions = preparation.entries.find((e) => e.experimentNumber === model.number);
  return {
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    experimentNumber: model.number,
    engine: 'bounded_model',
    engineVersion: `handbook-model-${model.number}@${model.version}`,
    modes: ['guided'],
    guidanceLevels: [],
    objectives: entry ? [entry.aimKey] : [],
    apparatus: [],
    chemicals: [],
    actions: ['safety', ...model.steps, 'record', 'finish'],
    inputs: model.controls.map((c) => c.id),
    safety: [
      `labs.precaution.${model.number}`,
      'labs.safety_ack',
      ...(refused > 0 ? ['engine.refuses_dangerous_combinations'] : []),
    ],
    calculations: [...calculations].sort(),
    observations: [...observations].sort(),
    assessment: {
      competencyEstimate: false,
      writtenAnswers: 'teacher_review',
      report: false,
      preLabQuestions: questions?.preLab.length ?? 0,
      postLabQuestions: questions?.postLab.length ?? 0,
    },
    unsupported: [...modeGaps(['guided'], []), ...BOUNDED_GAPS, 'itemised_apparatus'],
    limitation: { key: model.scopeKey },
    handbookPages: sorted(model.handbookPages),
    results: 'deterministic_engine',
  };
}

export function capabilityForTeaching(definition: TeachingDefinition): PracticalCapability {
  const prefix = definition.id;
  return {
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    experimentNumber: definition.experimentNumber,
    engine: 'teaching_template',
    engineVersion: `${definition.id}@r${definition.revision}`,
    modes: ['guided'],
    guidanceLevels: [],
    objectives: definition.aims.map((_, index) => `${prefix}.aim.${index}`),
    apparatus: definition.apparatus.map((a) => a.id),
    chemicals: definition.chemicals.map((_, index) => `${prefix}.chemical.${index}`),
    actions: unique([
      'safety',
      'select',
      ...definition.tests.flatMap((test) => test.steps.map((step) => step.id)),
      'record',
    ]),
    inputs:
      definition.template === 'fixed_volume_kinetics'
        ? definition.concentrationsMolDm3.map((c) => `time_at_${c}_mol_dm3`)
        : [],
    safety: definition.safety.map((_, index) => `${prefix}.safety.${index}`),
    calculations:
      definition.template === 'fixed_volume_kinetics' ? ['kinetics.rate_from_time'] : [],
    observations: definition.outcomes.map((o) => `${o.sampleId}+${o.testId}`),
    assessment: {
      competencyEstimate: false,
      writtenAnswers: 'teacher_review',
      report: false,
      preLabQuestions: definition.preLab.length,
      postLabQuestions: definition.postLab.length,
    },
    unsupported: [...modeGaps(['guided'], []), ...BOUNDED_GAPS],
    limitation: { text: definition.limitations },
    handbookPages: sorted(
      unique(
        definition.sources
          .filter((source) => /practical handbook/i.test(source.title))
          .flatMap((source) => source.pdfPages),
      ),
    ),
    results: 'deterministic_engine',
  };
}

/** Problems that would make an entry claim more than its engine supports. */
export function capabilityIssues(capability: PracticalCapability): string[] {
  const issues: string[] = [];
  const n = capability.experimentNumber;
  if (capability.modes.length === 0) issues.push(`${n}: no supported mode`);
  if (!capability.modes.includes('automatic') && !capability.unsupported.includes('automatic_mode'))
    issues.push(`${n}: automatic mode missing but not declared unsupported`);
  if (!capability.modes.includes('manual') && !capability.unsupported.includes('manual_mode'))
    issues.push(`${n}: manual mode missing but not declared unsupported`);
  if (capability.guidanceLevels.length > 0 && !capability.modes.includes('guided'))
    issues.push(`${n}: guidance levels without guided mode`);
  if (capability.engine !== 'full_engine' && capability.assessment.competencyEstimate)
    issues.push(`${n}: only the full engine computes a competency estimate`);
  if (
    capability.assessment.competencyEstimate ===
    capability.unsupported.includes('competency_estimate')
  )
    issues.push(`${n}: competency estimate support and the unsupported list disagree`);
  if (capability.actions.length === 0) issues.push(`${n}: no actions`);
  if (capability.safety.length === 0) issues.push(`${n}: no safety rules`);
  if (capability.handbookPages.length === 0) issues.push(`${n}: no handbook pages`);
  if (capability.results !== 'deterministic_engine')
    issues.push(`${n}: results must come from the engine`);
  return issues;
}

export interface CapabilitySources {
  full: readonly { definition: ExperimentDefinition; assessment: AssessmentDefinition }[];
  teaching: readonly TeachingDefinition[];
  handbook?: ReadonlyMap<number, HandbookModel>;
}

/** The bundled registry: one entry per practical number, each checked. */
export function buildCapabilityRegistry(
  sources: CapabilitySources,
): readonly PracticalCapability[] {
  const entries = [
    ...sources.full.map(({ definition, assessment }) =>
      capabilityForDefinition(definition, assessment),
    ),
    ...[...(sources.handbook ?? handbookModels).values()].map(capabilityForHandbookModel),
    ...sources.teaching.map(capabilityForTeaching),
  ];
  const seen = new Map<number, PracticalEngine>();
  const issues: string[] = [];
  for (const entry of entries) {
    const previous = seen.get(entry.experimentNumber);
    if (previous)
      issues.push(`${entry.experimentNumber}: claimed by ${previous} and ${entry.engine}`);
    seen.set(entry.experimentNumber, entry.engine);
    issues.push(...capabilityIssues(entry));
  }
  if (issues.length > 0)
    throw new Error(`Capability registry is inconsistent: ${issues.join('; ')}`);
  return entries.sort((a, b) => a.experimentNumber - b.experimentNumber);
}

export const capabilityFor = (
  registry: readonly PracticalCapability[],
  experimentNumber: number,
): PracticalCapability | undefined => registry.find((c) => c.experimentNumber === experimentNumber);
