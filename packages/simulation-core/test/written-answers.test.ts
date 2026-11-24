import { describe, expect, it } from 'vitest';
import { checkWrittenAnswer, normalizeStudentText, studentTextLocale } from '../src/writtenAnswers';

describe('bilingual bounded written-answer checks', () => {
  it.each([
    ['en', 'NaOH: dissolve 40 g and dilute to 500 cm³.'],
    ['si', 'NaOH 40 g දියකර 500 cm³ දක්වා තනුක කරන්න.'],
    ['si', 'සෝඩියම් හයිඩ්‍රොක්සයිඩ් 40 ග්‍රෑම් දියකර 0.5 dm³ දක්වා තනුක කරන්න.'],
  ] as const)('applies the same supported calculation checks in %s', (locale, text) => {
    expect(checkWrittenAnswer(text, 'exp04.postlab.q1a.prompt')).toMatchObject({
      status: 'matches_guide',
      locale,
    });
  });
  it.each([
    'Dissolve 400 g NaOH and dilute to 500 cm3.',
    'NaOH 400 g දියකර 500 cm3 දක්වා තනුක කරන්න.',
  ])('flags an incorrect explicit mass in either language', (text) => {
    expect(checkWrittenAnswer(text, 'exp04.postlab.q1a.prompt').status).toBe('needs_revision');
  });
  it('handles the other supported mass and conversions without accepting the first answer', () => {
    expect(
      checkWrittenAnswer(
        'Dissolve 3.32 g K₂C₂O₄ and dilute to 0.1 dm³.',
        'exp04.postlab.q1b.prompt',
      ).status,
    ).toBe('matches_guide');
    expect(
      checkWrittenAnswer('Dissolve 40 g K₂C₂O₄ and dilute to 100 cm³.', 'exp04.postlab.q1b.prompt')
        .status,
    ).toBe('needs_revision');
  });
  it('does not turn negation, missing units, unrelated text or unsupported questions into a pass', () => {
    for (const text of [
      'NaOH 40 500',
      'Do not dissolve 40 g NaOH and dilute to 500 cm3.',
      'hello',
      'NaOH 40 g දිය නොකර 500 cm3 දක්වා තනුක කරන්න.',
    ])
      expect(checkWrittenAnswer(text, 'exp04.postlab.q1a.prompt').status).toBe('review_required');
    expect(checkWrittenAnswer('My own explanation.', 'exp04.prelab.q1.prompt').status).toBe(
      'review_required',
    );
    expect(checkWrittenAnswer('මගේ පැහැදිලි කිරීම.', null).locale).toBe('si');
    expect(checkWrittenAnswer('   ', null).status).toBe('empty');
  });
  it('detects the input language independently of the UI and normalizes equivalent Unicode', () => {
    expect(studentTextLocale('Why use a funnel?', 'si')).toBe('en');
    expect(studentTextLocale('පුනීලයක් භාවිත කරන්නේ ඇයි?', 'en')).toBe('si');
    expect(studentTextLocale('26.5', 'si')).toBe('si');
    expect(normalizeStudentText('Na₂CO₃')).toBe(normalizeStudentText('Na2CO3'));
    expect(normalizeStudentText('ප්‍රමාණය')).toBe(normalizeStudentText('ප්රමාණය'));
  });
});
