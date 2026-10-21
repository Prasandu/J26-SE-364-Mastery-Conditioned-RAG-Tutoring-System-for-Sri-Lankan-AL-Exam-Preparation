import { describe, expect, it } from 'vitest';
import raw from '../../../content/experiments/teaching/handbook21-30.v1.json';
import {
  initialTeachingRun,
  parseTeachingDefinition,
  projectTeaching,
  transitionTeaching,
  calculateKinetics,
  type TeachingAction,
  type TeachingRun,
} from '../src/teaching';
const definitions = raw.map(parseTeachingDefinition);
const apply = (d: (typeof definitions)[number], s: TeachingRun, a: TeachingAction) => {
  const result = transitionTeaching(d, s, a, s.sequence);
  if (!result.accepted) throw new Error(String(result.error));
  return result.state;
};
describe('declarative simulations 21–30', () => {
  it('validates every definition and exact source page identity', () => {
    expect(definitions.map((d) => d.experimentNumber)).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
    for (const d of definitions) {
      expect(d.sources[0]!.pdfPages.length).toBeGreaterThan(0);
      expect(d.sources[0]!.sha256).toBe(
        '1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe',
      );
      expect(d.translationStatus).toBe('draft');
      for (const a of d.apparatus) expect(a.label.si).toBeTruthy();
    }
  });
  it.each(definitions)(
    '$id runs every sample/test combination and records replayable results',
    (d) => {
      for (const sample of d.samples)
        for (const test of d.tests) {
          let s = initialTeachingRun(d);
          s = apply(d, s, { type: 'safety', value: true });
          s = apply(d, s, { type: 'select', sampleId: sample.id, testId: test.id });
          if (test.temperatureRangeC) s = apply(d, s, { type: 'temperature', value: 2 });
          for (const c of d.concentrationsMolDm3)
            s = apply(d, s, { type: 'measurement', concentration: c, time: 100 / c });
          for (const step of test.steps)
            s = apply(d, s, { type: 'step', stepId: step.id, apparatusId: step.apparatusId });
          const p = projectTeaching(d, s);
          expect(p.finished).toBe(true);
          expect(d.template === 'fixed_volume_kinetics' ? p.kinetics : p.outcome).not.toBeNull();
          s = apply(d, s, { type: 'record' });
          s = apply(d, s, { type: 'notes', value: 'Exact notes\nසිංහල' });
          s = apply(d, s, { type: 'finish' });
          let replay = initialTeachingRun(d);
          for (const e of JSON.parse(JSON.stringify(s.events)) as TeachingRun['events'])
            replay = apply(d, replay, e.action);
          expect(replay).toEqual(s);
        }
    },
  );
  it('blocks safety, wrong tools, stale state and cold-bath violations', () => {
    const d = definitions[8]!;
    let s = initialTeachingRun(d);
    const step = d.tests[0]!.steps[0]!;
    const action: TeachingAction = { type: 'step', stepId: step.id, apparatusId: step.apparatusId };
    expect(transitionTeaching(d, s, action, 0).error).toBe('safety');
    s = apply(d, s, { type: 'safety', value: true });
    expect(transitionTeaching(d, s, action, 0).error).toBe('sequence');
    expect(transitionTeaching(d, s, { ...action, apparatusId: 'dropper' }, s.sequence).error).toBe(
      'instrument',
    );
    expect(transitionTeaching(d, s, action, s.sequence).error).toBe('temperature');
    s = apply(d, s, { type: 'temperature', value: 12 });
    expect(transitionTeaching(d, s, action, s.sequence).error).toBe('temperature');
    expect(s.step).toBe(0);
    const rejected = transitionTeaching(d, s, action, s.sequence);
    expect(rejected.state.events.at(-1)).toMatchObject({ accepted: false, error: 'temperature' });
    s = apply(d, s, { type: 'temperature', value: 2 });
    for (const next of d.tests[0]!.steps)
      s = apply(d, s, { type: 'step', stepId: next.id, apparatusId: next.apparatusId });
    s = apply(d, s, { type: 'temperature', value: 12 });
    expect(transitionTeaching(d, s, { type: 'record' }, s.sequence).error).toBe('temperature');
  });
  it('has no default kinetics measurements and derives order only from entered data', () => {
    const d = definitions[9]!;
    expect(initialTeachingRun(d).measurements).toEqual({});
    expect(calculateKinetics(d.concentrationsMolDm3, {})).toBeNull();
    const own = Object.fromEntries(d.concentrationsMolDm3.map((c) => [String(c), 100 / c ** 1.5]));
    expect(calculateKinetics(d.concentrationsMolDm3, own)!.order).toBeCloseTo(1.5, 10);
    expect(calculateKinetics(d.concentrationsMolDm3, own)!.rSquared).toBeCloseTo(1, 10);
    own['1'] = 0;
    expect(calculateKinetics(d.concentrationsMolDm3, own)).toBeNull();
  });
  it('projects sourced intermediate appearances without inventing kinetic curves', () => {
    const d = definitions[3]!;
    let s = apply(d, initialTeachingRun(d), { type: 'safety', value: true });
    for (const step of d.tests[0]!.steps.slice(0, 2))
      s = apply(d, s, { type: 'step', stepId: step.id, apparatusId: step.apparatusId });
    expect(projectTeaching(d, s).scene.solutionColour).toBe('orange');
    expect(projectTeaching(d, s).outcome).toBeNull();
    for (const step of d.tests[0]!.steps.slice(2))
      s = apply(d, s, { type: 'step', stepId: step.id, apparatusId: step.apparatusId });
    expect(projectTeaching(d, s).scene.solutionColour).toBe(d.outcomes[0]!.solutionColour);
    const invalid = structuredClone(d);
    invalid.tests[0]!.steps[1]!.appearance!.sourceIndexes = [999];
    expect(() => parseTeachingDefinition(invalid)).toThrow('outcome_source');
  });
  it('rejects missing outcomes, dangling sources, unsupported instruments and scripts', () => {
    const d = definitions[0]!;
    expect(() => parseTeachingDefinition({ ...d, outcomes: [] })).toThrow('missing_outcome');
    expect(() =>
      parseTeachingDefinition({
        ...d,
        outcomes: [{ ...d.outcomes[0], sourceIndexes: [99] }, ...d.outcomes.slice(1)],
      }),
    ).toThrow('outcome_source');
    expect(() => parseTeachingDefinition({ ...d, script: 'alert(1)' })).toThrow();
    expect(() =>
      parseTeachingDefinition({ ...d, apparatus: [{ ...d.apparatus[0], kind: 'unknown' }] }),
    ).toThrow();
  });
});
