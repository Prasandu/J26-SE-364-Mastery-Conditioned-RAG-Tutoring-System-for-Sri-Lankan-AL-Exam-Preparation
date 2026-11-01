import { describe, expect, it } from 'vitest';
import { LocaleSchema, QuantitySchema } from '../src';

describe('common contracts', () => {
  it('accepts a labelled quantity', () => {
    expect(QuantitySchema.parse({ value: 26.5, unit: 'g' })).toEqual({ value: 26.5, unit: 'g' });
  });

  it('rejects unlabelled or non-finite quantities', () => {
    expect(QuantitySchema.safeParse({ value: 26.5 }).success).toBe(false);
    expect(QuantitySchema.safeParse({ value: Infinity, unit: 'g' }).success).toBe(false);
    expect(QuantitySchema.safeParse({ value: 1, unit: 'ml' }).success).toBe(false);
  });

  it('supports only en and si locales', () => {
    expect(LocaleSchema.options).toEqual(['en', 'si']);
  });
});
