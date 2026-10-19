import { describe, expect, it } from 'vitest';
import {
  BuretteReadingSchema,
  EndpointRecordSchema,
  TitrationActionSchema,
  TitrationDefinitionSchema,
  TitrationStateSchema,
  TitrationTrialSchema,
} from '../src';

const sourceRef = {
  sourceId: 'nie-handbook-2018' as const,
  pdfPage: 120,
  printedPage: 112,
  factId: null,
  provenance: 'review_pending' as const,
};
const refs = [sourceRef];
const reading = (value: number) => ({ value, unit: 'cm3' as const });
const endpoint = (kind: 'first' | 'second', indicator: 'phenolphthalein' | 'methyl_orange') => ({
  endpoint: kind,
  indicator,
  observation:
    kind === 'first'
      ? ('phenolphthalein_pink_to_colourless' as const)
      : ('methyl_orange_orange_to_red' as const),
  buretteInitialReading: reading(0),
  buretteReading: reading(kind === 'first' ? 20 : 40),
  delivered: reading(kind === 'first' ? 20 : 20),
  sourceRefs: refs,
});

const trial = (trialNumber = 1) => ({
  trialNumber,
  aliquot: {
    apparatusId: 'pipette',
    volume: { value: 50, unit: 'cm3' as const },
    recordedAtTrial: trialNumber,
    sourceRefs: refs,
  },
  firstEndpoint: endpoint('first', 'phenolphthalein'),
  secondEndpoint: endpoint('second', 'methyl_orange'),
  sourceRefs: refs,
});

const definition = {
  schemaVersion: 1 as const,
  kind: 'carbonate_hcl_double_endpoint_titration' as const,
  experimentId: 'exp36_carbonate_hydrochloric_titration',
  definitionVersion: '0.1.0',
  experimentNumber: 36 as const,
  title: 'Titration between Na₂CO₃ and HCl using phenolphthalein and methyl orange',
  syllabusUnit: { unitNumber: 12 as const, title: 'Equilibrium' as const, sourceRefs: refs },
  sourceRefs: refs,
  teacherReviewStatus: 'teacher-review-pending' as const,
  runnable: false as const,
  apparatus: [
    {
      id: 'burette',
      kind: 'burette' as const,
      role: 'required' as const,
      capacity: { value: 50, unit: 'cm3' as const },
      capabilities: ['select', 'clean', 'fill', 'dispense', 'read', 'record'] as const,
      sourceRefs: refs,
      reviewStatus: 'teacher_review_pending' as const,
    },
  ],
  reagents: [
    {
      id: 'hydrochloric_acid',
      formula: 'HCl',
      physicalState: 'liquid' as const,
      role: 'titrant' as const,
      concentration: null,
      sourceRefs: refs,
      reviewStatus: 'teacher_review_pending' as const,
    },
  ],
  supportedCapabilities: ['burette_reading', 'titrant_delivery', 'endpoint_observation'] as const,
  requiredObservations: [
    'phenolphthalein_pink_to_colourless',
    'methyl_orange_orange_to_red',
  ] as const,
  endpointRecording: {
    first: {
      indicator: 'phenolphthalein' as const,
      observation: 'phenolphthalein_pink_to_colourless' as const,
    },
    second: {
      indicator: 'methyl_orange' as const,
      observation: 'methyl_orange_orange_to_red' as const,
    },
    sourceRefs: refs,
  },
  repeatedTrials: {
    minimumTrials: 3,
    averageRequired: true,
    sourceRefs: [{ ...sourceRef, pdfPage: 121, printedPage: 113 }],
    reviewStatus: 'source_stated' as const,
  },
  assessmentRef: { assessmentId: 'exp36_assessment', version: '0.1.0' },
  supportedModes: ['automatic', 'guided', 'manual'] as const,
};

describe('candidate titration contracts', () => {
  it('validates a review-only definition without adding it to the active definition union', () => {
    expect(TitrationDefinitionSchema.parse(definition).runnable).toBe(false);
  });

  it('rejects invalid capacities and non-finite or negative readings', () => {
    expect(BuretteReadingSchema.safeParse({ value: -1, unit: 'cm3' }).success).toBe(false);
    expect(BuretteReadingSchema.safeParse({ value: Number.NaN, unit: 'cm3' }).success).toBe(false);
    expect(
      TitrationDefinitionSchema.safeParse({
        ...definition,
        apparatus: [{ ...definition.apparatus[0], capacity: { value: 0, unit: 'cm3' } }],
      }).success,
    ).toBe(false);
  });

  it('rejects incompatible endpoint records and preserves endpoint ordering', () => {
    expect(EndpointRecordSchema.safeParse(endpoint('first', 'methyl_orange')).success).toBe(true);
    expect(
      TitrationTrialSchema.safeParse({
        ...trial(),
        secondEndpoint: { ...endpoint('second', 'methyl_orange'), buretteReading: reading(10) },
      }).success,
    ).toBe(false);
    expect(
      TitrationTrialSchema.safeParse({
        ...trial(),
        firstEndpoint: endpoint('second', 'phenolphthalein'),
      }).success,
    ).toBe(false);
  });

  it('keeps trial identity and source provenance explicit', () => {
    expect(TitrationTrialSchema.parse(trial(2)).trialNumber).toBe(2);
    expect(sourceRef.provenance).toBe('review_pending');
  });

  it('validates the dedicated state and typed actions without executing them', () => {
    const state = TitrationStateSchema.parse({
      schemaVersion: 1,
      kind: definition.kind,
      experimentId: definition.experimentId,
      definitionVersion: definition.definitionVersion,
      preparation: 'not_started',
      glassware: {
        volumetricFlask: 'not_ready',
        pipette: 'not_ready',
        titrationFlask: 'not_ready',
      },
      burette: { capacity: { value: 50, unit: 'cm3' }, state: 'not_ready', reading: reading(0) },
      currentTrial: 1,
      selectedIndicator: null,
      firstEndpoint: null,
      secondEndpoint: null,
      trialHistory: [],
      measurementProvenance: [],
      completion: 'incomplete',
    });
    expect(state.completion).toBe('incomplete');
    expect(
      TitrationActionSchema.parse({ type: 'rinse_burette', apparatusId: 'burette' }).type,
    ).toBe('rinse_burette');
  });
});
