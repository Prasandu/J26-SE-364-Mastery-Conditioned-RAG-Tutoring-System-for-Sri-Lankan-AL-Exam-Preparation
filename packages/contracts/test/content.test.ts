import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import assessmentJson from '../../../content/experiments/exp04/assessment.v1.json';
import definitionJson from '../../../content/experiments/exp04/definition.v1.json';
import enCommon from '../../../content/locales/en/common.json';
import enExp04 from '../../../content/locales/en/exp04.json';
import sourcesJson from '../../../content/sources.v1.json';
import {
  ActionTypeSchema,
  AssessmentDefinitionSchema,
  ErrorCodeSchema,
  ExperimentDefinitionSchema,
  RejectionCodeSchema,
  SourceRegistrySchema,
  type SourceRef,
} from '../src';

const definition = ExperimentDefinitionSchema.parse(definitionJson);
const assessment = AssessmentDefinitionSchema.parse(assessmentJson);
const sources = SourceRegistrySchema.parse(sourcesJson);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Walks any JSON value, yielding [path, key, value] for every object property. */
function* walk(value: unknown, path = '$'): Generator<[string, string, unknown]> {
  if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* walk(v, `${path}[${i}]`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      yield [`${path}.${k}`, k, v];
      yield* walk(v, `${path}.${k}`);
    }
}

describe('ExperimentDefinition v1 (Experiment 4)', () => {
  it('validates the committed definition', () => {
    expect(definition.kind).toBe('standard_solution_by_mass');
    expect(definition.experimentNumber).toBe(4);
  });

  it('rejects unknown fields at the root and in nested objects', () => {
    const root = { ...clone(definitionJson), surprise: true };
    expect(ExperimentDefinitionSchema.safeParse(root).success).toBe(false);
    const nested = clone(definitionJson);
    (nested.apparatus[0] as Record<string, unknown>).colour = 'blue';
    expect(ExperimentDefinitionSchema.safeParse(nested).success).toBe(false);
  });

  it('rejects an unknown discriminant', () => {
    expect(
      ExperimentDefinitionSchema.safeParse({ ...clone(definitionJson), kind: 'titration' }).success,
    ).toBe(false);
  });

  it('rejects chemistry entries without source references', () => {
    const bad = clone(definitionJson);
    bad.expectedResults.targetMass.sourceRefs = [];
    expect(ExperimentDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it('encodes the official Experiment 4 values', () => {
    const e = definition.expectedResults;
    expect(e.targetVolume.quantity).toEqual({ value: 250, unit: 'cm3' });
    expect(e.targetConcentration.quantity).toEqual({ value: 1, unit: 'mol dm-3' });
    expect(e.requiredAmount.quantity).toEqual({ value: 0.25, unit: 'mol' });
    expect(e.targetMass.quantity).toEqual({ value: 26.5, unit: 'g' });
    const solute = definition.chemicals.find((c) => c.id === e.soluteChemicalId);
    expect(solute?.molarMass?.quantity).toEqual({ value: 106, unit: 'g mol-1' });
    expect(e.label.requiredFields).toEqual(['solution_name', 'concentration', 'preparation_date']);
  });

  it('lists the handbook apparatus plus the optional dropper sourced from the procedure', () => {
    const ids = definition.apparatus.map((a) => a.id);
    for (const id of [
      'volumetric_flask_250',
      'beaker',
      'funnel',
      'watch_glass',
      'four_beam_balance',
      'wash_bottle',
    ])
      expect(ids).toContain(id);
    const dropper = definition.apparatus.find((a) => a.id === 'dropper_or_glass_tube');
    expect(dropper?.role).toBe('optional');
    expect(dropper?.sourceRefs.map((r) => r.factId)).toEqual(['E27']);
  });

  it('has exactly one transition rule and one action spec per action type', () => {
    for (const type of ActionTypeSchema.options) {
      expect(definition.transitionRules.filter((r) => r.action === type)).toHaveLength(1);
      expect(definition.availableActions.filter((a) => a.type === type)).toHaveLength(1);
    }
  });

  it('defines an error rule for every error code, with source references', () => {
    for (const code of ErrorCodeSchema.options) {
      const rule = definition.errorRules.find((r) => r.code === code);
      expect(rule, code).toBeDefined();
      expect(rule?.sourceRefs.length).toBeGreaterThan(0);
    }
  });

  it('keeps numeric consequences off contamination and mixing errors', () => {
    const consequence = (code: string) =>
      definition.errorRules.find((r) => r.code === code)?.consequence;
    expect(consequence('TAP_WATER_USED')).toBe('purity_risk');
    expect(consequence('DIRTY_FLASK_USED')).toBe('purity_risk');
    expect(consequence('DIRTY_GLASSWARE_USED')).toBe('purity_risk');
    expect(consequence('INSUFFICIENT_MIXING')).toBe('homogeneity_risk');
    expect(consequence('UNDISSOLVED_AT_MARK')).toBe('volume_validity');
  });

  it('contains no executable code', () => {
    for (const [path, , value] of walk(definitionJson))
      if (typeof value === 'string')
        expect(value, path).not.toMatch(/=>|\bfunction\b|\beval\(|<script|new Function/);
  });

  it('hides answer guides until submission', () => {
    for (const q of [...definition.preLabQuestions, ...definition.postLabQuestions])
      expect(q.revealAnswerAfter).toBe('submission');
  });
});

describe('source references', () => {
  const facts = new Map(sources.facts.map((f) => [f.factId, f]));
  const refs: [string, SourceRef][] = [];
  for (const [path, key, value] of walk(definitionJson))
    if (key === 'sourceRefs')
      (value as SourceRef[]).forEach((r, i) => refs.push([`${path}[${i}]`, r]));

  it('allow-lists only the four normalized source files', () => {
    expect(sources.documents.map((d) => d.filename).sort()).toEqual([
      'component-01-virtual-lab-proposal.pdf',
      'nie-al-chemistry-syllabus-2017.pdf',
      'nie-chemistry-practical-handbook-2018.pdf',
      'nie-grade-12-chemistry-resource-book-en.pdf',
    ]);
    expect(JSON.stringify(sourcesJson)).not.toContain('Reserach Project');
  });

  it('every sourceRef in the definition matches a registered fact and page', () => {
    expect(refs.length).toBeGreaterThan(100);
    for (const [path, r] of refs) {
      const fact = facts.get(r.factId);
      expect(fact, `${path} → ${r.factId}`).toBeDefined();
      expect(
        { sourceId: r.sourceId, pdfPage: r.pdfPage, printedPage: r.printedPage },
        path,
      ).toEqual({
        sourceId: fact?.sourceId,
        pdfPage: fact?.pdfPage,
        printedPage: fact?.printedPage,
      });
    }
  });

  it('every registered fact has a row in docs/SOURCE_MAP.md', () => {
    const map = readFileSync(new URL('../../../docs/SOURCE_MAP.md', import.meta.url), 'utf8');
    for (const f of sources.facts)
      expect(map, f.factId).toMatch(new RegExp(`\\|\\s*${f.factId}\\s*\\|`));
  });
});

describe('localisation keys', () => {
  const usedKeys = new Set<string>();
  for (const [, key, value] of walk(definitionJson))
    if (key.endsWith('Key') && typeof value === 'string') usedKeys.add(value);
  const declared = new Set(definition.localisationKeys);
  const en = new Set(Object.keys(enExp04).filter((k) => k !== '_meta'));

  it('every visible text field is a declared localisation key', () => {
    for (const k of usedKeys) expect(declared.has(k), k).toBe(true);
    for (const k of declared) expect(usedKeys.has(k), `${k} declared but unused`).toBe(true);
  });

  it('every key has English text and there are no orphan English keys', () => {
    expect([...en].sort()).toEqual([...declared].sort());
    for (const k of declared) expect((enExp04 as Record<string, unknown>)[k], k).toMatch(/\S/);
  });

  it('has English text for every engine rejection, source title and the assessment disclaimer', () => {
    const common = enCommon as Record<string, unknown>;
    for (const code of RejectionCodeSchema.options)
      expect(common[`engine.rejection.${code}`], code).toBeTruthy();
    for (const d of sources.documents) expect(common[d.titleKey], d.titleKey).toBeTruthy();
    expect(common[assessment.disclaimerKey]).toBeTruthy();
  });
});

describe('assessment.v1.json (provisional parameters)', () => {
  const ids = new Set(assessment.parameters.map((p) => p.parameterId));

  it('marks every value as a simulation assumption pending teacher review', () => {
    for (const p of assessment.parameters) {
      expect(p.sourceType).toBe('simulation_assumption');
      expect(p.reviewStatus).toBe('teacher_review_pending');
      expect(p.version).toBeGreaterThanOrEqual(1);
    }
    expect(ids.size).toBe(assessment.parameters.length);
  });

  it('labels the result as a practical competency estimate', () => {
    expect(assessment.resultLabel).toBe('practical competency estimate');
  });

  it('every binding and scoring reference points to a defined parameter', () => {
    const refs: string[] = [];
    for (const [, , value] of walk({
      b: assessment.bindings,
      s: assessment.scoring,
      p: assessment.safetyPolicy,
      a: assessment.adaptation,
    }))
      if (typeof value === 'string' && value.startsWith('param.')) refs.push(value);
    expect(refs.length).toBeGreaterThan(30);
    for (const r of refs) expect(ids.has(r), r).toBe(true);
  });

  it('every parameter referenced by the definition exists', () => {
    for (const [path, key, value] of walk(definitionJson))
      if (key === 'parameterIds')
        for (const id of value as string[]) expect(ids.has(id), `${path}: ${id}`).toBe(true);
  });

  it('has a deduction for every error code', () => {
    for (const code of ErrorCodeSchema.options)
      expect(
        assessment.scoring.errorDeductions.some((d) => d.errorCode === code),
        code,
      ).toBe(true);
  });

  it('rejects a parameter presented as an NIE fact', () => {
    const bad = clone(assessmentJson);
    (bad.parameters[0] as Record<string, unknown>).sourceType = 'nie_official';
    expect(AssessmentDefinitionSchema.safeParse(bad).success).toBe(false);
  });
});
