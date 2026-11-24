// Run with `pnpm --filter @vlab/simulation-core fixtures:write` to regenerate packages/contracts/fixtures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { buildSharedFixtures } from './test/shared-fixtures';

it('writes shared fixtures', () => {
  for (const [file, value] of Object.entries(buildSharedFixtures())) {
    const target = fileURLToPath(new URL(`../contracts/fixtures/${file}`, import.meta.url));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  }
});
