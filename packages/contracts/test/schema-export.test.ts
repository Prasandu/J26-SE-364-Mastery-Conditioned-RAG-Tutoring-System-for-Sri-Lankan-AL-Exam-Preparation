import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderSchema, SCHEMAS } from '../scripts/json-schemas';

describe('exported JSON Schemas', () => {
  for (const [file, schema] of Object.entries(SCHEMAS))
    it(`${file} is up to date (run schemas:write if this fails)`, () => {
      const committed = readFileSync(new URL(`../schema/${file}`, import.meta.url), 'utf8');
      expect(committed).toBe(renderSchema(schema));
    });

  it('rejects unknown properties in the experiment definition schema', () => {
    const json = JSON.parse(renderSchema(SCHEMAS['experiment-definition.v1.json'])) as {
      oneOf?: { additionalProperties?: boolean }[];
      anyOf?: { additionalProperties?: boolean }[];
    };
    const variants = json.oneOf ?? json.anyOf ?? [];
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) expect(v.additionalProperties).toBe(false);
  });
});
