import type { ActionEnvelope, SessionInit, SimulationState } from '@vlab/contracts';
import type { SimulationContext } from './context';
import { validateHandlerCompatibility } from './registry';
import type { TransitionResult } from './handlers/standardSolutionEngine';

export type { TransitionResult } from './handlers/standardSolutionEngine';

export const createInitialState = (init: SessionInit, ctx: SimulationContext): SimulationState =>
  validateHandlerCompatibility(ctx, init.mode).createInitialState(init, ctx);

export const transition = (
  state: SimulationState,
  envelope: ActionEnvelope,
  ctx: SimulationContext,
): TransitionResult =>
  validateHandlerCompatibility(ctx, state.meta.mode).transition(state, envelope, ctx);
