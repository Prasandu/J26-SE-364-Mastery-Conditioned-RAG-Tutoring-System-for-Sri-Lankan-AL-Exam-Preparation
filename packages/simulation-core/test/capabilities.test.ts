import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../../../content/experiments/teaching/handbook21-30.v1.json';
import {
  buildCapabilityRegistry,
  calculateHandbook,
  capabilityFor,
  capabilityForHandbookModel,
  capabilityForTeaching,
  capabilityIssues,
  CAPABILITY_REGISTRY_VERSION,
  handbookModels,
  handlerFor,
  initialHandbookRun,
  parseTeachingDefinition,
  transitionHandbook,
  type PracticalCapability,
} from '../src';
import {
  buildCapabilityArtifact,
  CAPABILITY_ARTIFACT,
  renderArtifact,
} from './capability-artifact';
import { ctx } from './helpers';

/**
 * LAB-011: the capability registry says, per practical, what its engine really supports.
 * Each entry is derived from the engine, so these tests check the derivation against the
 * engines themselves and that no entry claims more than its engine does.
 */

const teaching = raw.map(parseTeachingDefinition);
const registry = buildCapabilityRegistry({
  full: [{ definition: ctx.definition, assessment: ctx.assessment }],
  teaching,
});
const entry = (n: number) => capabilityFor(registry, n)!;

describe('practical capability registry', () => {
  it('has exactly one entry for each practical with a simulation: 1-30', () => {
    expect(registry.map((c) => c.experimentNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(new Set(registry.map((c) => c.registryVersion))).toEqual(
      new Set([CAPABILITY_REGISTRY_VERSION]),
    );
    expect(registry.flatMap(capabilityIssues)).toEqual([]);
    expect(registry.every((c) => c.results === 'deterministic_engine')).toBe(true);
  });

  it('describes Experiment 4 from its definition and handler', () => {
    const exp4 = entry(4);
    const handler = handlerFor(ctx.definition.kind);

    expect(exp4.engine).toBe('full_engine');
    expect(exp4.engineVersion).toBe(
      `${ctx.definition.experimentId}@${ctx.definition.definitionVersion}+${ctx.assessment.assessmentId}@${ctx.assessment.version}`,
    );
    expect(exp4.modes).toEqual(
      ['automatic', 'guided', 'manual'].filter((m) => handler.supportsMode(m as never)),
    );
    expect(exp4.guidanceLevels).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(exp4.actions).toEqual([...new Set(ctx.definition.availableActions.map((a) => a.type))]);
    expect(exp4.safety).toEqual(ctx.definition.safetyRules.map((r) => r.id));
    expect(exp4.calculations).toEqual(ctx.definition.measurementRules.map((r) => r.id));
    expect(exp4.observations).toEqual(ctx.definition.observations.map((o) => o.id));
    expect(exp4.assessment).toMatchObject({
      competencyEstimate: true,
      writtenAnswers: 'guide_check',
      report: true,
    });
    expect(exp4.unsupported).toEqual([]);
    expect(exp4.handbookPages).toEqual(expect.arrayContaining([9, 16, 29, 30]));
  });

  it('offers bounded handbook models in guided practice only, and says what they leave out', () => {
    for (const n of [1, 2, 3, ...Array.from({ length: 16 }, (_, i) => i + 5)]) {
      const c = entry(n);
      expect(c.engine).toBe('bounded_model');
      expect(c.modes).toEqual(['guided']);
      expect(c.guidanceLevels).toEqual([]);
      expect(c.unsupported).toEqual(
        expect.arrayContaining([
          'automatic_mode',
          'manual_mode',
          'competency_estimate',
          'server_session',
          'predicted_measurements',
        ]),
      );
      expect(c.assessment).toMatchObject({
        competencyEstimate: false,
        writtenAnswers: 'teacher_review',
      });
      expect(c.limitation).toEqual({ key: handbookModels.get(n)!.scopeKey });
    }
  });

  it("lists every action the handbook engine accepts, in the engine's order", () => {
    for (const [n, model] of handbookModels) {
      const c = entry(n);
      expect(c.actions).toEqual(['safety', ...model.steps, 'record', 'finish']);
      // Walking the declared steps in order is accepted by the engine itself.
      let run = initialHandbookRun(n);
      const step = (action: Parameters<typeof transitionHandbook>[1]) => {
        const next = transitionHandbook(run, action, run.sequence);
        expect(next.accepted, `${n}: ${JSON.stringify(action)}`).toBe(true);
        run = next.state;
      };
      step({ type: 'safety', value: true });
      for (const id of model.steps) step({ type: 'step', id });
    }
  });

  it('takes observations and readings from the handbook calculation, not from a list', () => {
    const exp1 = entry(1);
    const tube = handbookModels.get(1)!.controls.find((c) => c.id === 'tube')!;
    expect(exp1.observations.length).toBeGreaterThan(1);
    for (const option of tube.options!) {
      const inputs = { ...initialHandbookRun(1).inputs, tube: option };
      expect(exp1.observations).toContain(calculateHandbook(1, inputs).observation);
    }
    const withReadings = registry.filter(
      (c) => c.engine === 'bounded_model' && c.calculations.length > 0,
    );
    expect(withReadings.length).toBeGreaterThan(0);
    expect(
      withReadings.every((c) => c.calculations.every((label) => label.startsWith('labs.reading.'))),
    ).toBe(true);
  });

  it('records the combinations the engine refuses as a safety behaviour', () => {
    expect(entry(9).safety).toContain('engine.refuses_dangerous_combinations');
    let run = initialHandbookRun(9);
    for (const action of [
      { type: 'safety', value: true },
      { type: 'input', id: 'metal', value: 'Na' },
      { type: 'input', id: 'medium', value: 'dilute_HCl' },
    ] as const) {
      run = transitionHandbook(run, action, run.sequence).state;
    }
    const refused = transitionHandbook(
      run,
      { type: 'step', id: handbookModels.get(9)!.steps[0]! },
      run.sequence,
    );
    expect(refused).toMatchObject({ accepted: false, error: 'dangerous_combination' });
    expect(entry(1).safety).not.toContain('engine.refuses_dangerous_combinations');
  });

  it('describes teaching templates 21-30 from their definitions', () => {
    for (const d of teaching) {
      const c = entry(d.experimentNumber);
      expect(c.engine).toBe('teaching_template');
      expect(c.engineVersion).toBe(`${d.id}@r${d.revision}`);
      expect(c.modes).toEqual(['guided']);
      expect(c.apparatus).toEqual(d.apparatus.map((a) => a.id));
      expect(c.observations).toHaveLength(d.outcomes.length);
      expect(c.limitation).toEqual({ text: d.limitations });
      expect(c.calculations).toEqual(
        d.template === 'fixed_volume_kinetics' ? ['kinetics.rate_from_time'] : [],
      );
    }
  });

  it('refuses two engines claiming the same practical', () => {
    const duplicate = { ...teaching[0]!, experimentNumber: 4 };
    expect(() =>
      buildCapabilityRegistry({
        full: [{ definition: ctx.definition, assessment: ctx.assessment }],
        teaching: [duplicate],
      }),
    ).toThrow(/4: claimed by full_engine and teaching_template/);
  });

  it('flags an entry that claims more than its engine supports', () => {
    const bounded = capabilityForHandbookModel(handbookModels.get(1)!);
    const overclaim: PracticalCapability = {
      ...bounded,
      unsupported: bounded.unsupported.filter(
        (u) => u !== 'manual_mode' && u !== 'competency_estimate',
      ),
      assessment: { ...bounded.assessment, competencyEstimate: true },
    };
    expect(capabilityIssues(overclaim)).toEqual(
      expect.arrayContaining([
        '1: manual mode missing but not declared unsupported',
        '1: only the full engine computes a competency estimate',
      ]),
    );
    expect(capabilityIssues(capabilityForTeaching(teaching[0]!))).toEqual([]);
  });

  it('is deterministic', () => {
    const again = buildCapabilityRegistry({
      full: [{ definition: ctx.definition, assessment: ctx.assessment }],
      teaching,
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(registry));
  });
});

describe('published capability registry', () => {
  it(`${CAPABILITY_ARTIFACT} is up to date (run fixtures:write if this fails)`, () => {
    const committed = readFileSync(
      new URL(`../../../${CAPABILITY_ARTIFACT}`, import.meta.url),
      'utf8',
    );
    expect(committed).toBe(renderArtifact(buildCapabilityArtifact()));
  });
});
