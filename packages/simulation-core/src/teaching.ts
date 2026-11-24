import { TeachingDefinitionSchema, teachingIssues, type TeachingDefinition } from '@vlab/contracts';

export function parseTeachingDefinition(value: unknown): TeachingDefinition {
  const definition = TeachingDefinitionSchema.parse(value);
  const issues = teachingIssues(definition);
  if (issues.length) throw new Error(issues.join(', '));
  return definition;
}
export interface KineticsPoint {
  concentration: number;
  time: number;
  inverseTime: number;
  logConcentration: number;
  logRate: number;
}
export interface KineticsResult {
  points: readonly KineticsPoint[];
  order: number;
  rSquared: number | null;
}
export function calculateKinetics(
  concentrations: readonly number[],
  times: Readonly<Record<string, number>>,
): KineticsResult | null {
  if (
    concentrations.length < 3 ||
    concentrations.some((c) => !Number.isFinite(times[String(c)]) || times[String(c)]! <= 0)
  )
    return null;
  const points = concentrations.map((c) => ({
    concentration: c,
    time: times[String(c)]!,
    inverseTime: 1 / times[String(c)]!,
    logConcentration: Math.log(c),
    logRate: Math.log(1 / times[String(c)]!),
  }));
  const mx = points.reduce((s, p) => s + p.logConcentration, 0) / points.length;
  const my = points.reduce((s, p) => s + p.logRate, 0) / points.length;
  const xx = points.reduce((s, p) => s + (p.logConcentration - mx) ** 2, 0);
  if (xx <= 0) return null;
  const order = points.reduce((s, p) => s + (p.logConcentration - mx) * (p.logRate - my), 0) / xx;
  const total = points.reduce((s, p) => s + (p.logRate - my) ** 2, 0);
  const residual = points.reduce(
    (s, p) => s + (p.logRate - my - order * (p.logConcentration - mx)) ** 2,
    0,
  );
  return { points, order, rSquared: total > 1e-20 ? Math.max(0, 1 - residual / total) : null };
}
export type TeachingOutcome = TeachingDefinition['outcomes'][number];
export interface TeachingTrial {
  sampleId: string;
  testId: string;
  temperatureC: number | null;
  measurements: Readonly<Record<string, number>>;
  outcome: TeachingOutcome | null;
  kinetics: KineticsResult | null;
}
export interface TeachingRun {
  definitionId: string;
  revision: number;
  sequence: number;
  safety: boolean;
  step: number;
  sampleId: string;
  testId: string;
  temperatureC: number | null;
  measurements: Readonly<Record<string, number>>;
  notes: string;
  trials: readonly TeachingTrial[];
  recorded: boolean;
  completed: boolean;
  events: readonly {
    sequence: number;
    action: TeachingAction;
    accepted: boolean;
    error: TeachingError | null;
  }[];
}
export type TeachingAction =
  | { type: 'safety'; value: boolean }
  | { type: 'select'; sampleId: string; testId: string }
  | { type: 'temperature'; value: number }
  | { type: 'step'; stepId: string; apparatusId: string }
  | { type: 'measurement'; concentration: number; time: number }
  | { type: 'notes'; value: string }
  | { type: 'record' | 'new_trial' | 'finish' };
export type TeachingError =
  | 'version'
  | 'sequence'
  | 'safety'
  | 'order'
  | 'selection'
  | 'instrument'
  | 'temperature'
  | 'measurements'
  | 'recorded'
  | 'complete';
export function initialTeachingRun(d: TeachingDefinition): TeachingRun {
  return {
    definitionId: d.id,
    revision: d.revision,
    sequence: 0,
    safety: false,
    step: 0,
    sampleId: d.samples[0]!.id,
    testId: d.tests[0]!.id,
    temperatureC: null,
    measurements: {},
    notes: '',
    trials: [],
    recorded: false,
    completed: false,
    events: [],
  };
}
export function projectTeaching(d: TeachingDefinition, s: TeachingRun) {
  const test = d.tests.find((t) => t.id === s.testId)!;
  const sample = d.samples.find((x) => x.id === s.sampleId)!;
  const finished = s.step === test.steps.length;
  const appearance = test.steps
    .slice(0, s.step)
    .reverse()
    .find((step) => step.appearance)?.appearance;
  const outcome = finished
    ? (d.outcomes.find((o) => o.sampleId === s.sampleId && o.testId === s.testId) ?? null)
    : null;
  return {
    test,
    sample,
    nextStep: test.steps[s.step] ?? null,
    outcome,
    scene: {
      solutionColour: outcome?.solutionColour ?? appearance?.solutionColour ?? sample.colour,
      precipitateColour: outcome
        ? outcome.precipitateColour
        : (appearance?.precipitateColour ?? null),
      visual: outcome?.visual ?? appearance?.visual ?? 'none',
      phase: test.steps[Math.max(0, s.step - 1)]!.effect,
    },
    kinetics:
      finished && d.template === 'fixed_volume_kinetics'
        ? calculateKinetics(d.concentrationsMolDm3, s.measurements)
        : null,
    finished,
  };
}
export function transitionTeaching(
  d: TeachingDefinition,
  s: TeachingRun,
  a: TeachingAction,
  expected: number,
): { accepted: boolean; state: TeachingRun; error: TeachingError | null } {
  const fail = (error: TeachingError) => ({
    accepted: false,
    error,
    state: {
      ...s,
      events: [...s.events, { sequence: expected, action: a, accepted: false, error }],
    },
  });
  if (d.id !== s.definitionId || d.revision !== s.revision) return fail('version');
  if (expected !== s.sequence) return fail('sequence');
  if (s.completed && a.type !== 'notes' && a.type !== 'new_trial') return fail('complete');
  let next = { ...s };
  const p = projectTeaching(d, s);
  switch (a.type) {
    case 'safety':
      if (s.step) return fail('order');
      next.safety = a.value;
      break;
    case 'select':
      if (s.step) return fail('order');
      if (!d.samples.some((x) => x.id === a.sampleId) || !d.tests.some((x) => x.id === a.testId))
        return fail('selection');
      next.sampleId = a.sampleId;
      next.testId = a.testId;
      next.temperatureC = null;
      break;
    case 'temperature':
      if (s.recorded || !Number.isFinite(a.value) || a.value < -20 || a.value > 200)
        return fail('temperature');
      next.temperatureC = a.value;
      break;
    case 'measurement':
      if (!s.safety) return fail('safety');
      if (
        s.recorded ||
        d.template !== 'fixed_volume_kinetics' ||
        !d.concentrationsMolDm3.includes(a.concentration) ||
        !Number.isFinite(a.time) ||
        a.time <= 0 ||
        a.time > 1e6
      )
        return fail('measurements');
      next.measurements = { ...s.measurements, [String(a.concentration)]: a.time };
      break;
    case 'step': {
      if (!s.safety) return fail('safety');
      if (!p.nextStep || p.nextStep.id !== a.stepId) return fail('order');
      if (p.nextStep.apparatusId !== a.apparatusId) return fail('instrument');
      const range = p.test.temperatureRangeC;
      if (
        range &&
        (s.temperatureC === null || s.temperatureC < range[0] || s.temperatureC > range[1])
      )
        return fail('temperature');
      if (
        p.nextStep.effect === 'measure' &&
        d.template === 'fixed_volume_kinetics' &&
        !calculateKinetics(d.concentrationsMolDm3, s.measurements)
      )
        return fail('measurements');
      next.step++;
      break;
    }
    case 'notes':
      if (a.value.length > 20000) return fail('measurements');
      next.notes = a.value;
      break;
    case 'record':
      if (!p.finished || s.recorded) return fail('recorded');
      if (
        p.test.temperatureRangeC &&
        (s.temperatureC === null ||
          s.temperatureC < p.test.temperatureRangeC[0] ||
          s.temperatureC > p.test.temperatureRangeC[1])
      )
        return fail('temperature');
      if (d.template === 'fixed_volume_kinetics' && !p.kinetics) return fail('measurements');
      next.trials = [
        ...s.trials,
        {
          sampleId: s.sampleId,
          testId: s.testId,
          temperatureC: s.temperatureC,
          measurements: { ...s.measurements },
          outcome: p.outcome,
          kinetics: p.kinetics,
        },
      ];
      next.recorded = true;
      break;
    case 'new_trial':
      if (!s.recorded) return fail('recorded');
      next = {
        ...initialTeachingRun(d),
        sampleId: s.sampleId,
        testId: s.testId,
        safety: s.safety,
        notes: s.notes,
        trials: s.trials,
        events: s.events,
      };
      break;
    case 'finish':
      if (!s.recorded || !s.trials.length) return fail('recorded');
      next.completed = true;
      break;
  }
  next.sequence = s.sequence + 1;
  next.events = [
    ...s.events,
    { sequence: expected, action: { ...a }, accepted: true, error: null },
  ];
  return { accepted: true, state: next, error: null };
}
