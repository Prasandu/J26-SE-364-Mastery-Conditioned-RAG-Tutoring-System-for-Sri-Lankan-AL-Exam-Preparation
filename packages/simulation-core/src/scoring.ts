import type {
  Deduction,
  DomainEvent,
  ErrorCategory,
  Report,
  ScoreCategory,
  SimulationState,
} from '@vlab/contracts';
import type { SimulationContext } from './context';
import { bound, boundNumber, paramNumber, profileOf } from './context';
import { fingerprint } from './fingerprint';
import { achievedConcentration, grams, targetConcentration, transferredMassG } from './lab';

const CATEGORY_OF: Record<ErrorCategory, ScoreCategory> = {
  safety_violation: 'safety',
  technique_error: 'technique',
  measurement_error: 'measurement',
  completion_error: 'completeness',
};

const CATEGORIES: ScoreCategory[] = [
  'safety',
  'technique',
  'measurement',
  'completeness',
  'independence',
];

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Evidence-based practical competency estimate for the current attempt.
 * Pure function of state + assessment parameters; replaying the same events yields the same report.
 */
export const buildReport = (state: SimulationState, ctx: SimulationContext): Report => {
  const { lab, meta } = state;
  const { scoring } = ctx.assessment;
  const events = state.events.filter((e) => e.attempt === meta.attempt);
  const accepted = events.filter((e) => e.accepted);
  const deductions: Record<ScoreCategory, Deduction[]> = {
    safety: [],
    technique: [],
    measurement: [],
    completeness: [],
    independence: [],
  };

  // 1. Every recorded error -> deduction in its own category, evidenced by its event.
  const resolution = new Map<string, number>(); // `${code}:${raisedSeq}` -> resolving seq
  for (const e of accepted)
    for (const r of e.resolvedErrors) resolution.set(`${r.code}:${r.seq}`, e.seq);
  const factor = paramNumber(ctx, scoring.recoveredErrorFactor);
  for (const e of accepted) {
    for (const err of e.errors) {
      const deductionParam = scoring.errorDeductions.find((d) => d.errorCode === err.code);
      if (!deductionParam) throw new Error(`No deduction parameter for ${err.code}`);
      const resolvedBy = resolution.get(`${err.code}:${e.seq}`);
      const base = paramNumber(ctx, deductionParam.parameterId);
      deductions[CATEGORY_OF[err.category]].push({
        reason: err.code,
        points: resolvedBy === undefined ? base : base * factor,
        parameterIds:
          resolvedBy === undefined
            ? [deductionParam.parameterId]
            : [deductionParam.parameterId, scoring.recoveredErrorFactor],
        eventSeqs: resolvedBy === undefined ? [e.seq] : [e.seq, resolvedBy],
        resolved: resolvedBy !== undefined,
        sourceRefs: err.sourceRefs,
      });
    }
  }

  // 2. Measurement outcome, evidenced by the events that fixed mass and volume.
  const concentration = achievedConcentration(lab, ctx.definition);
  const target = targetConcentration(ctx.definition);
  const measurementEvents = accepted
    .filter((e) =>
      e.measurements.some((m) => m.id === 'final_volume' || m.id === 'transferred_solute_mass'),
    )
    .map((e) => e.seq);
  const lastEventSeq = events.at(-1)?.seq;
  let absoluteError: number | null = null;
  let relativeError: number | null = null;
  if (concentration.value) {
    absoluteError = concentration.value.value - target.value;
    relativeError = absoluteError / target.value;
    const tolerance = boundNumber(ctx, 'concentrationRelativeTolerance');
    if (Math.abs(relativeError) > tolerance && measurementEvents.length > 0)
      deductions.measurement.push({
        reason: 'concentration_out_of_tolerance',
        points: paramNumber(ctx, scoring.concentrationOutOfTolerance),
        parameterIds: [
          scoring.concentrationOutOfTolerance,
          bound(ctx, 'concentrationRelativeTolerance'),
        ],
        eventSeqs: measurementEvents,
        resolved: false,
        sourceRefs:
          ctx.definition.measurementRules.find((m) => m.id === 'achieved_concentration')
            ?.sourceRefs ?? [],
      });
  } else if (lab.submitted && lastEventSeq !== undefined) {
    deductions.measurement.push({
      reason: 'concentration_unavailable',
      points: paramNumber(ctx, scoring.concentrationUnavailable),
      parameterIds: [scoring.concentrationUnavailable],
      eventSeqs: measurementEvents.length > 0 ? measurementEvents : [lastEventSeq],
      resolved: false,
      sourceRefs: [],
    });
  }

  // 3. Independence: hints and the support profile used (not assessed in automatic demonstration).
  const studentEvents: DomainEvent[] = events.filter((e) => e.actor === 'student');
  for (const e of accepted.filter((ev) => ev.hintUsed))
    deductions.independence.push({
      reason: 'hint_used',
      points: paramNumber(ctx, scoring.hintDeduction),
      parameterIds: [scoring.hintDeduction],
      eventSeqs: [e.seq],
      resolved: false,
      sourceRefs: [],
    });
  const profile = profileOf(meta);
  const guidanceParam = scoring.guidanceDeductions[profile];
  const guidancePoints = paramNumber(ctx, guidanceParam);
  const firstStudentEvent = studentEvents[0];
  if (guidancePoints > 0 && firstStudentEvent)
    deductions.independence.push({
      reason: 'guidance_support',
      points: guidancePoints,
      parameterIds: [guidanceParam],
      eventSeqs: [firstStudentEvent.seq],
      resolved: false,
      sourceRefs: [],
    });

  const categories = CATEGORIES.map((category) => {
    const notAssessed = category === 'independence' && meta.mode === 'automatic';
    const total = deductions[category].reduce((sum, d) => sum + d.points, 0);
    return {
      category,
      score: notAssessed ? null : round1(Math.max(0, 100 - total)),
      weightParameterId: scoring.categoryWeights[category],
      deductions: notAssessed ? [] : deductions[category],
    };
  });

  const weighted = categories.filter((c) => c.score !== null);
  const weightSum = weighted.reduce((s, c) => s + paramNumber(ctx, c.weightParameterId), 0);
  const overall =
    weighted.length === 0 || weightSum === 0
      ? null
      : round1(
          weighted.reduce((s, c) => s + (c.score ?? 0) * paramNumber(ctx, c.weightParameterId), 0) /
            weightSum,
        );

  // Recovered vs. still-standing errors, evidenced by their events.
  const recovered: Report['errorSummary']['recovered'] = [];
  const unresolved: Report['errorSummary']['unresolved'] = [];
  for (const e of accepted)
    for (const err of e.errors) {
      const resolvedSeq = resolution.get(`${err.code}:${e.seq}`);
      if (resolvedSeq === undefined)
        unresolved.push({ code: err.code, seq: e.seq, recoverability: err.recoverability });
      else recovered.push({ code: err.code, raisedSeq: e.seq, resolvedSeq });
    }
  const provisionalParameterIds = [
    ...new Set([
      ...accepted.flatMap((e) => e.parameterIdsUsed),
      ...categories.flatMap((c) => c.deductions.flatMap((d) => d.parameterIds)),
      ...categories.filter((c) => c.score !== null).map((c) => c.weightParameterId),
    ]),
  ].sort();
  const e4 = ctx.definition.expectedResults;
  const seenRefs = new Set<string>();
  const sourceRefs = [
    ...e4.targetVolume.sourceRefs,
    ...e4.targetConcentration.sourceRefs,
    ...e4.requiredAmount.sourceRefs,
    ...e4.targetMass.sourceRefs,
    ...accepted.flatMap((e) => e.errors.flatMap((x) => x.sourceRefs)),
  ].filter((r) => {
    const key = `${r.sourceId}:${r.factId}`;
    if (seenRefs.has(key)) return false;
    seenRefs.add(key);
    return true;
  });

  return {
    sessionId: meta.sessionId,
    experimentId: meta.experimentId,
    definitionVersion: meta.definitionVersion,
    mode: meta.mode,
    guidanceLevel: meta.guidanceLevel,
    attempt: meta.attempt,
    resultLabel: ctx.assessment.resultLabel,
    disclaimerKey: ctx.assessment.disclaimerKey,
    assessmentVersion: ctx.assessment.version,
    categories,
    overall,
    measurements: {
      targetConcentration: target,
      weighedMass: lab.transfer.weighedMass,
      transferredMass: grams(transferredMassG(lab)),
      finalVolume: lab.flask.finalVolume,
      achievedConcentration: concentration.value,
      concentrationUnavailableReason: concentration.unavailableReason,
      absoluteError: absoluteError === null ? null : { value: absoluteError, unit: 'mol dm-3' },
      relativeError,
    },
    validity: {
      purityRisks: [...new Set(lab.risks.purity.map((r) => r.code))],
      homogeneity: lab.risks.homogeneity,
      volumeValidity: lab.risks.volumeValidity,
      restartRequired: lab.restartRequired,
    },
    completion: lab.submitted ? 'submitted' : 'incomplete',
    hints: meta.hints,
    retries: meta.retries,
    elapsedMs: meta.elapsedMs,
    actionSequence: accepted.map((e) => e.envelope.action.type),
    errorSummary: { recovered, unresolved },
    provisionalParameterIds,
    sourceRefs,
    headFingerprint: state.events.at(-1)?.fingerprintAfter ?? fingerprint(state),
  };
};
