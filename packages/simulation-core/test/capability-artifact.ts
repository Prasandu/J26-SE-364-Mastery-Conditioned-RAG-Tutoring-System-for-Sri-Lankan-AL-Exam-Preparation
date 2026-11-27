import raw from '../../../content/experiments/teaching/handbook21-30.v1.json';
import {
  buildCapabilityRegistry,
  CAPABILITY_REGISTRY_VERSION,
  parseTeachingDefinition,
} from '../src';
import { ctx } from './helpers';

/** content/experiments/capabilities.v1.json: the registry other components and the API read. */
export const CAPABILITY_ARTIFACT = 'content/experiments/capabilities.v1.json';

export const buildCapabilityArtifact = () => ({
  registryVersion: CAPABILITY_REGISTRY_VERSION,
  generatedBy: 'pnpm --filter @vlab/simulation-core fixtures:write',
  note: 'Derived from the engines; do not edit by hand. Results always come from the deterministic engine.',
  practicals: buildCapabilityRegistry({
    full: [{ definition: ctx.definition, assessment: ctx.assessment }],
    teaching: raw.map(parseTeachingDefinition),
  }),
});

export const renderArtifact = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
