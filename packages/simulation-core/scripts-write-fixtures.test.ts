// Run with `pnpm --filter @vlab/simulation-core fixtures:write` to regenerate packages/contracts/fixtures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import {
  buildCapabilityArtifact,
  CAPABILITY_ARTIFACT,
  renderArtifact,
} from './test/capability-artifact';
import { buildSharedFixtures } from './test/shared-fixtures';

it('writes shared fixtures', () => {
  for (const [file, value] of Object.entries(buildSharedFixtures())) {
    const target = fileURLToPath(new URL(`../contracts/fixtures/${file}`, import.meta.url));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  }
});

it('writes the practical capability registry', () => {
  const target = fileURLToPath(new URL(`../../${CAPABILITY_ARTIFACT}`, import.meta.url));
  writeFileSync(target, renderArtifact(buildCapabilityArtifact()));
});
