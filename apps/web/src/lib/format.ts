import type { Locale, Quantity, SourceRef, Unit } from '@vlab/contracts';

/** Unit symbols are never translated. */
export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  cm3: 'cm³',
  dm3: 'dm³',
  mol: 'mol',
  'mol dm-3': 'mol dm⁻³',
  'g mol-1': 'g mol⁻¹',
};

const numberLocale = (locale: Locale) => (locale === 'si' ? 'si-LK' : 'en-GB');

/** Display formatting only; values come from the engine or the experiment definition. */
export const formatQuantity = (q: Quantity, locale: Locale, maximumFractionDigits = 2): string =>
  `${new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits }).format(q.value)} ${UNIT_LABEL[q.unit]}`;

const MS_PER_SECOND = 1e3;

export const formatSeconds = (ms: number, locale: Locale): string =>
  new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(
    Math.floor(ms / MS_PER_SECOND),
  );

export const dedupeRefs = (refs: readonly SourceRef[]): SourceRef[] => {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.sourceId}:${r.pdfPage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
