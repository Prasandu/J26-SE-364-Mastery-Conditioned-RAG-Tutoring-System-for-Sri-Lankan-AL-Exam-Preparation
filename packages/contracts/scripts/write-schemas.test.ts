// Run with `pnpm --filter @vlab/contracts schemas:write` to regenerate schema/*.json.
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { renderSchema, SCHEMAS } from './json-schemas';

it('writes JSON Schemas', () => {
  for (const [file, schema] of Object.entries(SCHEMAS))
    writeFileSync(new URL(`../schema/${file}`, import.meta.url), renderSchema(schema));
});
