import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSharedFixtures } from './shared-fixtures';

const render = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('shared cross-implementation fixtures', () => {
  for (const [file, value] of Object.entries(buildSharedFixtures()))
    it(`${file} is up to date (run fixtures:write if this fails)`, () => {
      const committed = readFileSync(
        new URL(`../../contracts/fixtures/${file}`, import.meta.url),
        'utf8',
      );
      expect(committed).toBe(render(value));
    });
});
