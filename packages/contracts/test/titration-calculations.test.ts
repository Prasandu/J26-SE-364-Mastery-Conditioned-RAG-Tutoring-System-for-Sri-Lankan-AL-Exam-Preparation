import { describe, expect, it } from 'vitest';
import {
  aliquotAmount,
  cm3ToDm3,
  dm3ToCm3,
  firstEquivalenceVolume,
  preparedSolutionConcentration,
  secondCumulativeEquivalenceVolume,
  sodiumCarbonateAmount,
  trialAverage,
} from '../src';

const molarMass = { value: 105.99, unit: 'g mol-1' as const };
const hcl = { value: 0.1, unit: 'mol dm-3' as const };

describe('candidate titration calculations', () => {
  it('calculates sodium carbonate amount with explicit units', () => {
    expect(sodiumCarbonateAmount({ value: 0.2, unit: 'g' }, molarMass)).toEqual({
      value: 0.2 / 105.99,
      unit: 'mol',
    });
    expect(sodiumCarbonateAmount({ value: 0.0002, unit: 'kg' }, molarMass)).toEqual({
      value: 0.2 / 105.99,
      unit: 'mol',
    });
  });

  it('uses the 250 cm3 final mark for prepared concentration', () => {
    const concentration = preparedSolutionConcentration({ value: 0.2, unit: 'g' }, molarMass, {
      value: 250,
      unit: 'cm3',
    });
    expect(concentration.unit).toBe('mol dm-3');
    expect(concentration.value).toBeCloseTo(0.2 / 105.99 / 0.25, 12);
  });

  it('calculates aliquot moles and distinguishes cumulative endpoints', () => {
    const prepared = { value: 0.01, unit: 'mol dm-3' as const };
    const aliquot = aliquotAmount(prepared, { value: 50, unit: 'cm3' });
    const first = firstEquivalenceVolume(aliquot, hcl);
    const second = secondCumulativeEquivalenceVolume(aliquot, hcl);

    expect(aliquot).toEqual({ value: 0.0005, unit: 'mol' });
    expect(first).toEqual({ value: 0.005, unit: 'dm3' });
    expect(second).toEqual({ value: 0.01, unit: 'dm3' });
    expect(second.value).toBe(2 * first.value);
  });

  it('converts dm3 and cm3 without implicit unit assumptions', () => {
    expect(cm3ToDm3(250)).toBe(0.25);
    expect(dm3ToCm3(0.05)).toBe(50);
  });

  it('requires at least three readings by default and averages same-unit trials', () => {
    expect(
      trialAverage([
        { value: 20.1, unit: 'cm3' },
        { value: 20.2, unit: 'cm3' },
        { value: 20.3, unit: 'cm3' },
      ]),
    ).toEqual({ value: 20.2, unit: 'cm3' });
    expect(() => trialAverage([{ value: 20, unit: 'cm3' }])).toThrow(
      'at least 3 trial readings are required',
    );
  });

  it('rejects invalid quantities, units and precision-breaking mixed trials', () => {
    expect(() => sodiumCarbonateAmount({ value: -0.2, unit: 'g' }, molarMass)).toThrow();
    expect(() =>
      preparedSolutionConcentration({ value: Number.POSITIVE_INFINITY, unit: 'g' }, molarMass, {
        value: 250,
        unit: 'cm3',
      }),
    ).toThrow();
    expect(() =>
      aliquotAmount({ value: 0, unit: 'mol dm-3' }, { value: 50, unit: 'cm3' }),
    ).toThrow();
    expect(() =>
      trialAverage([
        { value: 20, unit: 'cm3' },
        { value: 0.02, unit: 'dm3' },
        { value: 20, unit: 'cm3' },
      ]),
    ).toThrow('same unit');
    expect(() => cm3ToDm3(-1)).toThrow();
  });
});
