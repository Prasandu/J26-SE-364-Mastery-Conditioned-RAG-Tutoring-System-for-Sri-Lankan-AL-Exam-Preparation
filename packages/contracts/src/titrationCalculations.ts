import type { Mass, Quantity, Volume } from './common';

const assertFiniteNonNegative = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
};

const assertFinitePositive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
};

export const cm3ToDm3 = (volumeCm3: number): number => {
  assertFiniteNonNegative(volumeCm3, 'volume');
  return volumeCm3 / 1000;
};

export const dm3ToCm3 = (volumeDm3: number): number => {
  assertFiniteNonNegative(volumeDm3, 'volume');
  return volumeDm3 * 1000;
};

const massInGrams = (mass: Mass): number => {
  assertFiniteNonNegative(mass.value, 'mass');
  return mass.unit === 'g' ? mass.value : mass.value * 1000;
};

const volumeInDm3 = (volume: Volume): number => {
  assertFiniteNonNegative(volume.value, 'volume');
  return volume.unit === 'dm3' ? volume.value : cm3ToDm3(volume.value);
};

const concentrationInMolDm3 = (concentration: Quantity): number => {
  if (concentration.unit !== 'mol dm-3') {
    throw new RangeError('concentration must use mol dm-3');
  }
  assertFinitePositive(concentration.value, 'concentration');
  return concentration.value;
};

const quantity = <U extends Quantity['unit']>(value: number, unit: U): Quantity & { unit: U } => {
  if (!Number.isFinite(value)) throw new RangeError('calculation result must be finite');
  return { value, unit };
};

/** Ideal amount of Na₂CO₃ from measured mass and supplied molar mass. */
export const sodiumCarbonateAmount = (
  mass: Mass,
  molarMass: Quantity & { unit: 'g mol-1' },
): Quantity & { unit: 'mol' } => {
  const grams = massInGrams(mass);
  assertFinitePositive(grams, 'mass');
  assertFinitePositive(molarMass.value, 'molar mass');
  return quantity(grams / molarMass.value, 'mol');
};

/** Ideal concentration after dilution to the supplied final volumetric mark. */
export const preparedSolutionConcentration = (
  sampleMass: Mass,
  molarMass: Quantity & { unit: 'g mol-1' },
  finalVolume: Volume,
): Quantity & { unit: 'mol dm-3' } => {
  const volumeDm3 = volumeInDm3(finalVolume);
  assertFinitePositive(volumeDm3, 'final volume');
  const moles = sodiumCarbonateAmount(sampleMass, molarMass).value;
  return quantity(moles / volumeDm3, 'mol dm-3');
};

/** Ideal Na₂CO₃ amount in the supplied aliquot. */
export const aliquotAmount = (
  concentration: Quantity & { unit: 'mol dm-3' },
  aliquotVolume: Volume,
): Quantity & { unit: 'mol' } => {
  const volumeDm3 = volumeInDm3(aliquotVolume);
  assertFinitePositive(volumeDm3, 'aliquot volume');
  return quantity(concentrationInMolDm3(concentration) * volumeDm3, 'mol');
};

const endpointVolume = (
  aliquotMoles: Quantity & { unit: 'mol' },
  hclConcentration: Quantity & { unit: 'mol dm-3' },
  carbonateEquivalents: 1 | 2,
): Quantity & { unit: 'dm3' } => {
  assertFinitePositive(aliquotMoles.value, 'aliquot amount');
  return quantity(
    (aliquotMoles.value * carbonateEquivalents) / concentrationInMolDm3(hclConcentration),
    'dm3',
  );
};

/** Ideal first equivalence-point HCl volume; not an observed indicator endpoint. */
export const firstEquivalenceVolume = (
  aliquotMoles: Quantity & { unit: 'mol' },
  hclConcentration: Quantity & { unit: 'mol dm-3' },
): Quantity & { unit: 'dm3' } => endpointVolume(aliquotMoles, hclConcentration, 1);

/** Ideal cumulative HCl volume at the second equivalence point. */
export const secondCumulativeEquivalenceVolume = (
  aliquotMoles: Quantity & { unit: 'mol' },
  hclConcentration: Quantity & { unit: 'mol dm-3' },
): Quantity & { unit: 'dm3' } => endpointVolume(aliquotMoles, hclConcentration, 2);

export const trialAverage = (readings: readonly Volume[], minimumTrials = 3): Volume => {
  if (!Number.isInteger(minimumTrials) || minimumTrials < 1) {
    throw new RangeError('minimumTrials must be a positive integer');
  }
  if (readings.length < minimumTrials) {
    throw new RangeError(`at least ${minimumTrials} trial readings are required`);
  }
  const [firstReading] = readings;
  if (!firstReading) throw new RangeError('at least one trial reading is required');
  const unit = firstReading.unit;
  if (readings.some((reading) => reading.unit !== unit)) {
    throw new RangeError('trial readings must use the same unit');
  }
  const total = readings.reduce((sum, reading) => {
    assertFiniteNonNegative(reading.value, 'trial reading');
    return sum + reading.value;
  }, 0);
  return { value: total / readings.length, unit };
};
