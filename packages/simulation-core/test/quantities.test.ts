import { describe, expect, it } from 'vitest';
import { add, compare, convert, qty, subtract, UnitMismatchError } from '../src';

describe('quantities', () => {
  it('converts cm3 to dm3 using the handbook factor of 1000 cm3 dm-3', () => {
    expect(convert(qty(250, 'cm3'), 'dm3').value).toBeCloseTo(0.25, 12);
  });

  it('converts mass units', () => {
    expect(convert(qty(0.0265, 'kg'), 'g').value).toBeCloseTo(26.5, 12);
  });

  it('refuses to convert or compare across dimensions', () => {
    expect(() => convert(qty(26.5, 'g'), 'cm3')).toThrow(UnitMismatchError);
    expect(() => compare(qty(1, 'mol'), qty(1, 'mol dm-3'))).toThrow(UnitMismatchError);
  });

  it('adds and subtracts in the left operand unit', () => {
    expect(add(qty(240, 'cm3'), qty(0.01, 'dm3'))).toEqual(qty(250, 'cm3'));
    expect(subtract(qty(56.5, 'g'), qty(30, 'g'))).toEqual(qty(26.5, 'g'));
  });

  it('compares labelled values', () => {
    expect(compare(qty(250, 'cm3'), qty(0.25, 'dm3'))).toBeCloseTo(0, 12);
    expect(compare(qty(251, 'cm3'), qty(250, 'cm3'))).toBeGreaterThan(0);
  });

  it('rejects non-finite values', () => {
    expect(() => qty(Number.NaN, 'g')).toThrow(RangeError);
  });
});
