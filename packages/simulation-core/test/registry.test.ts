import type { ActionEnvelope, Mode, SessionInit } from '@vlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  handlerFor,
  handlerForContext,
  IncompatibleExperimentError,
  registeredExperimentKinds,
  transition,
  UnknownExperimentKindError,
} from '../src';
import {
  createInitialState as createStandardSolutionState,
  transition as transitionStandardSolution,
} from '../src/handlers/standardSolutionEngine';
import { ctx } from './helpers';

const init = (mode: SessionInit['mode'] = 'manual'): SessionInit => ({
  sessionId: 'registry-test',
  mode,
  guidanceLevel: mode === 'guided' ? 'beginner' : null,
  seed: 42,
  startedOn: '2026-10-10',
});

const safetyAction: ActionEnvelope = {
  action: {
    type: 'confirm_safety',
    checklistItemIds: ctx.definition.safetyRules
      .filter((rule) => rule.kind === 'checklist')
      .map((rule) => rule.id),
  },
  actor: 'student',
  elapsedMs: 1000,
  acknowledgedSafetyWarning: false,
};

describe('experiment registry', () => {
  it('registers only trusted, statically defined handlers', () => {
    expect(registeredExperimentKinds()).toEqual(['standard_solution_by_mass']);
    expect(handlerFor('standard_solution_by_mass').capabilities).toEqual({
      automatic: true,
      guided: true,
      manual: true,
      procedure: true,
      guidance: true,
      assessment: true,
      publicProjection: true,
      versionCompatibility: true,
    });
  });

  it('rejects unknown experiment kinds', () => {
    expect(() => handlerFor('uploaded_code')).toThrow(UnknownExperimentKindError);
    expect(() => handlerFor('carbonate_hcl_double_endpoint_titration')).toThrow(
      UnknownExperimentKindError,
    );
  });

  it('rejects definition and assessment version mismatches', () => {
    const incompatible = {
      ...ctx,
      assessment: { ...ctx.assessment, version: '9.9.9' },
    };
    expect(() => handlerForContext(incompatible)).toThrow(IncompatibleExperimentError);
  });

  it('rejects definitions whose kind is not supported by the trusted handler', () => {
    const incompatible = {
      ...ctx,
      definition: { ...ctx.definition, kind: 'uploaded_code' as never },
    };
    expect(() => handlerForContext(incompatible)).toThrow(UnknownExperimentKindError);
  });

  it('declares mode compatibility before creating a session', () => {
    const handler = handlerFor('standard_solution_by_mass');
    expect(handler.supportsMode('automatic')).toBe(true);
    expect(handler.supportsMode('guided')).toBe(true);
    expect(handler.supportsMode('manual')).toBe(true);
    expect(handler.supportsMode('unsupported' as Mode)).toBe(false);
  });

  it('preserves initial state and transition output through the adapter', () => {
    const session = init('manual');
    const direct = createStandardSolutionState(session, ctx);
    const throughRegistry = createInitialState(session, ctx);
    expect(throughRegistry).toEqual(direct);

    const directTransition = transitionStandardSolution(direct, safetyAction, ctx);
    const registryTransition = transition(throughRegistry, safetyAction, ctx);
    expect(registryTransition).toEqual(directTransition);
  });

  it('preserves automatic initialization compatibility', () => {
    const session = init('automatic');
    expect(createInitialState(session, ctx)).toEqual(createStandardSolutionState(session, ctx));
  });
});
