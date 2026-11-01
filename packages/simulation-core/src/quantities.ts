import type { Quantity, Unit } from '@vlab/contracts';

type Dimension = 'mass' | 'volume' | 'amount' | 'concentration' | 'molarMass';

/**
 * Integer scale of each unit relative to the smallest unit of its dimension (g, cm3, ...).
 * Integer factors keep conversions such as 250 cm3 -> 0.25 dm3 exact in floating point.
 */
const UNITS: Record<Unit, { dimension: Dimension; scale: number }> = {
  g: { dimension: 'mass', scale: 1 },
  kg: { dimension: 'mass', scale: 1000 },
  cm3: { dimension: 'volume', scale: 1 },
  dm3: { dimension: 'volume', scale: 1000 },
  mol: { dimension: 'amount', scale: 1 },
  'mol dm-3': { dimension: 'concentration', scale: 1 },
  'g mol-1': { dimension: 'molarMass', scale: 1 },
};

export class UnitMismatchError extends Error {
  constructor(from: Unit, to: Unit) {
    super(`Cannot convert ${from} to ${to}: different dimensions`);
    this.name = 'UnitMismatchError';
  }
}

export const qty = (value: number, unit: Unit): Quantity => {
  if (!Number.isFinite(value)) throw new RangeError(`Quantity value must be finite: ${value}`);
  return { value, unit };
};

export const dimensionOf = (unit: Unit): Dimension => UNITS[unit].dimension;

export const convert = (q: Quantity, to: Unit): Quantity => {
  const from = UNITS[q.unit];
  const target = UNITS[to];
  if (from.dimension !== target.dimension) throw new UnitMismatchError(q.unit, to);
  if (from.scale === target.scale) return qty(q.value, to);
  return from.scale > target.scale
    ? qty(q.value * (from.scale / target.scale), to)
    : qty(q.value / (target.scale / from.scale), to);
};

export const add = (a: Quantity, b: Quantity): Quantity =>
  qty(a.value + convert(b, a.unit).value, a.unit);

export const subtract = (a: Quantity, b: Quantity): Quantity =>
  qty(a.value - convert(b, a.unit).value, a.unit);

/** Negative if a < b, zero if equal, positive if a > b. Throws on mismatched dimensions. */
export const compare = (a: Quantity, b: Quantity): number => a.value - convert(b, a.unit).value;

/** Round to the nearest multiple of `resolution`, avoiding binary artefacts such as 26.500000000000004. */
export const roundToResolution = (value: number, resolution: number): number => {
  if (!(resolution > 0)) throw new RangeError(`Resolution must be positive: ${resolution}`);
  const decimals = Math.max(0, Math.ceil(-Math.log10(resolution)));
  return Number((Math.round(value / resolution) * resolution).toFixed(decimals));
};

/** Values within this absolute distance are treated as equal (floating-point noise only). */
export const EPSILON = 1e-9;
