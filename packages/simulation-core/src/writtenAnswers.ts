/** Bounded source-guide checks. Never changes experiment state or awards a competency score. */
export const normalizeStudentText = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\u2212/g, '-')
    .toLowerCase()
    .trim();

export function studentTextLocale(text: string, fallback: 'en' | 'si' = 'en'): 'en' | 'si' {
  if (/[\u0d85-\u0dc6]/u.test(text.normalize('NFC'))) return 'si';
  return /[a-z]/i.test(text) ? 'en' : fallback;
}

export type WrittenAnswerStatus = 'empty' | 'matches_guide' | 'needs_revision' | 'review_required';
export interface WrittenAnswerResult {
  status: WrittenAnswerStatus;
  locale: 'en' | 'si';
  guideKey: string | null;
}

const NEGATED = /\b(?:not|never|incorrect|wrong|without)\b|නොවේ|නැත|නැහැ|නොකර|නොවන/u;
const includesAll = (text: string, groups: string[][]) =>
  groups.every((group) => group.some((phrase) => text.includes(normalizeStudentText(phrase))));
const compact = (text: string) => text.replace(/\s/g, '');

/** Only existing sourced Experiment 4 guides currently have authored checking rules.
 * Unsupported questions, paraphrases and ambiguous/negated prose go to human review.
 * Sinhala and English use the same criteria, independent of the interface language.
 */
export function checkWrittenAnswer(
  text: string,
  questionKey: string | null,
  fallback: 'en' | 'si' = 'en',
): WrittenAnswerResult {
  const normalized = normalizeStudentText(text);
  const result = (
    status: WrittenAnswerStatus,
    guideKey: string | null = null,
  ): WrittenAnswerResult => ({ status, locale: studentTextLocale(text, fallback), guideKey });
  if (!normalized) return result('empty');
  if (!questionKey || NEGATED.test(normalized)) return result('review_required');
  const key = questionKey.replace(/\.prompt$/, '.answer');
  const flat = compact(normalized);
  if (questionKey === 'exp04.prelab.q2.prompt') {
    if (/c\s*=\s*n\s*\*\s*v|c\s*=\s*v\s*\/\s*n/.test(normalized))
      return result('needs_revision', key);
    const match =
      /c\s*=\s*n\s*\/\s*v/.test(normalized) ||
      includesAll(normalized, [
        ['solute', 'ද්‍රාව්‍ය'],
        ['mol', 'amount', 'මවුල', 'ප්‍රමාණ'],
        ['volume', 'පරිමා'],
        ['divid', 'per unit', '/', 'බෙද', 'ඒකක පරිමා'],
      ]);
    return result(match ? 'matches_guide' : 'review_required', key);
  }
  if (questionKey === 'exp04.prelab.q3.prompt') {
    const match = includesAll(normalized, [
      ['volumetric flask', 'පරිමාමිතික ප්ලාස්කු', 'පරිමාමිතික කුප්පි'],
      ['beaker', 'බීකර'],
      ['funnel', 'පුනීල'],
      ['watch glass', 'ඔරලෝසු වීදුරු'],
    ]);
    return result(match ? 'matches_guide' : 'review_required', key);
  }
  if (questionKey === 'exp04.postlab.q3.prompt') {
    const match = includesAll(flat, [
      ['na2co3', 'සෝඩියම්කාබනේට්', 'sodiumcarbonate'],
      ['k2cr2o7', 'potassiumdichromate', 'පොටෑසියම්ඩයික්‍රෝමේට්'],
      ['kio3', 'potassiumiodate', 'පොටෑසියම්අයඩේට්'],
    ]);
    return result(match ? 'matches_guide' : 'review_required', key);
  }
  const preparation =
    questionKey === 'exp04.postlab.q1a.prompt'
      ? { mass: 40, volume: 500, names: ['naoh', 'sodiumhydroxide', 'සෝඩියම්හයිඩ්‍රොක්සයිඩ්'] }
      : questionKey === 'exp04.postlab.q1b.prompt'
        ? { mass: 3.32, volume: 100, names: ['k2c2o4', 'potassiumoxalate', 'පොටෑසියම්ඔක්සලේට්'] }
        : null;
  if (!preparation) return result('review_required');
  const masses = [
    ...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:grams?\b|g\b|ග්රෑම්)(?!\s*(?:mol|මවුල))/gu),
  ].map((m) => Number(m[1]));
  if (masses.length === 1 && Math.abs(masses[0]! - preparation.mass) > 1e-8)
    return result('needs_revision', key);
  const massOk = masses.length === 1 && Math.abs(masses[0]! - preparation.mass) <= 1e-8;
  const volumes = [
    ...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(cm\s*3|ml\b|dm\s*3|l\b|ලීටර්|මිලිලීටර්)/gu),
  ].map((m) => Number(m[1]) * (/^(?:dm|l\b|ලීටර්)/u.test(m[2]!) ? 1000 : 1));
  const volumeOk = volumes.some((v) => Math.abs(v - preparation.volume) <= 1e-8);
  const procedureOk = includesAll(normalized, [
    ['dissolv', 'දිය කර', 'දියකර'],
    ['dilut', 'make up', 'තනුක', 'දක්වා'],
  ]);
  return result(
    massOk && volumeOk && procedureOk && includesAll(flat, [preparation.names])
      ? 'matches_guide'
      : 'review_required',
    key,
  );
}
