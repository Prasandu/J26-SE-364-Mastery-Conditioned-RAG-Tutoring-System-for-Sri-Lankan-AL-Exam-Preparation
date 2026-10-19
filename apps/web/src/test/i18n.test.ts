import {
  ErrorCodeSchema,
  ActionTypeSchema,
  MeasurementIdSchema,
  ObservationIdSchema,
} from '@vlab/contracts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createI18n, LOCALE_FILES, resources, translationMeta, type LocaleFileName } from '../i18n';

const FILES = Object.keys(LOCALE_FILES.en) as LocaleFileName[];
const keysOf = (o: object) =>
  Object.keys(o)
    .filter((k) => k !== '_meta')
    .sort();

describe('English/Sinhala key parity', () => {
  it.each(FILES)('%s.json has exactly the same keys in en and si', (file) => {
    expect(keysOf(LOCALE_FILES.si[file])).toEqual(keysOf(LOCALE_FILES.en[file]));
  });

  it('every value is a non-empty string in both locales', () => {
    for (const locale of ['en', 'si'] as const)
      for (const [k, v] of Object.entries(resources[locale].translation))
        expect(v, `${locale}:${k}`).toMatch(/\S/);
  });
});

describe('translation metadata', () => {
  it.each(FILES)('si/%s.json is a draft translation with no reviewer yet', (file) => {
    expect(translationMeta('si', file)).toEqual({
      locale: 'si',
      role: 'translation',
      translationStatus: 'draft',
      reviewer: null,
      reviewedOn: null,
    });
  });

  it.each(FILES)('en/%s.json is the canonical source text', (file) => {
    expect(translationMeta('en', file)).toMatchObject({ locale: 'en', role: 'canonical' });
  });
});

describe('formulas, units and identifiers are preserved in Sinhala', () => {
  // Chemical formulas and number-with-unit tokens that must appear verbatim.
  const TOKEN =
    /Na₂CO₃|K₂C₂O₄|K₂Cr₂O₇|KIO₃|NaOH|\(26\.5 \+ w\) g|\d+(?:\.\d+)? (?:cm³ dm⁻³|mol dm⁻³|g mol⁻¹|cm³|dm³|mol|g)(?![a-zA-Z])|\b[cnm] = [cnmMV](?: [×÷] [cnmMV])*/g;

  it.each(FILES)(
    '%s.json: every formula and quantity in English appears unchanged in Sinhala',
    (file) => {
      const en = LOCALE_FILES.en[file] as Record<string, unknown>;
      const si = LOCALE_FILES.si[file] as Record<string, unknown>;
      for (const key of keysOf(en)) {
        const tokens = String(en[key]).match(TOKEN) ?? [];
        for (const token of tokens) expect(String(si[key]), `${key}: ${token}`).toContain(token);
      }
    },
  );

  it('keeps the key Experiment 4 values exactly', () => {
    const si = resources.si.translation;
    expect(si['exp04.calc.amount']).toContain('1 mol dm⁻³ × 250 cm³');
    expect(si['exp04.calc.mass']).toContain('106 g mol⁻¹ = 26.5 g');
    expect(si['exp04.stage.weighing.goal']).toContain('Na₂CO₃ 26.5 g');
  });

  it('retains the English technical term after Sinhala apparatus names', () => {
    const si = resources.si.translation;
    expect(si['exp04.apparatus.volumetric_flask_250']).toContain('(volumetric flask)');
    expect(si['exp04.apparatus.four_beam_balance']).toContain('(four beam balance)');
    expect(si['exp04.step.adjust_to_mark.instruction']).toContain('(meniscus)');
  });
});

describe('missing keys', () => {
  const src = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (
        /\.tsx?$/.test(f) &&
        !/\.test\.tsx?$/.test(f) &&
        !p.includes(`${join('src', 'test')}`)
      )
        files.push(p);
    }
  };
  walk(src);
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('every literal key used in UI code exists in English (and therefore Sinhala)', () => {
    const literal = [
      ...source.matchAll(/['"`]((?:ui|app|engine|exp04|assessment|sources)\.[a-z0-9_.]+)['"`]/g),
    ].map((m) => m[1] ?? '');
    expect(literal.length).toBeGreaterThan(150);
    for (const key of literal) expect(resources.en.translation[key], key).toBeDefined();
  });

  it('every dynamically built key has a translation', () => {
    const dynamic = [
      ...['en', 'si'].map((l) => `ui.language.${l}`),
      ...['automatic', 'guided', 'manual'].flatMap((m) => [
        `ui.mode.${m}.title`,
        `ui.mode.${m}.description`,
      ]),
      ...['beginner', 'intermediate', 'advanced'].flatMap((l) => [
        `ui.level.${l}.title`,
        `ui.level.${l}.description`,
      ]),
      ...['automatic', 'guided_beginner', 'guided_intermediate', 'guided_advanced', 'manual'].map(
        (p) => `ui.profile.${p}`,
      ),
      ...['done', 'current', 'todo'].map((s) => `ui.stage.${s}`),
      ...['student', 'system'].map((a) => `ui.log.actor.${a}`),
      ...ActionTypeSchema.options.map((a) => `exp04.action.${a}`),
      ...ErrorCodeSchema.options.map((c) => `exp04.error.${c.toLowerCase()}.message`),
      ...MeasurementIdSchema.options.map((m) => `exp04.measurement.${m}`),
      ...ObservationIdSchema.options.map((o) => `exp04.observation.${o}`),
      ...['shelf', 'bench', 'on_balance', 'on_flask'].map((p) => `ui.lab.placement.${p}`),
      ...[
        'context',
        'materials',
        'predictions',
        'protocol',
        'results',
        'reflection',
        'summary',
      ].map((p) => `ui.side.${p}`),
      ...['shelf', 'bench', 'on_balance', 'on_flask'].map((p) => `ui.lab.where.${p}`),
      ...['guidance', 'observation', 'procedural', 'rejected', 'safety'].map(
        (k) => `ui.log.kind.${k}`,
      ),
    ];
    for (const locale of ['en', 'si'] as const)
      for (const key of dynamic)
        expect(resources[locale].translation[key], `${locale}:${key}`).toBeDefined();
  });

  it('a missing key renders as the key itself (no silent English fallback)', () => {
    const i18n = createI18n('si');
    expect(i18n.t('ui.does_not_exist')).toBe('ui.does_not_exist');
    expect(i18n.t('ui.library.title')).toBe(resources.si.translation['ui.library.title']);
  });
});

describe('F17: dissolution wording', () => {
  const all = (['en', 'si'] as const).flatMap((l) => Object.entries(resources[l].translation));

  it('never claims that an arbitrary amount of water dissolves the sample', () => {
    for (const [key, text] of all) {
      expect(text, key).not.toMatch(
        /any (amount|quantity|volume) of water|any water|water present|a little water dissolves/i,
      );
      expect(text, key).not.toMatch(/ඕනෑම ජල/);
    }
  });

  it('uses "sufficient distilled water ... completely dissolved" and leaves the minimum volume unspecified', () => {
    const en = resources.en.translation;
    expect(en['ui.form.dissolve_help']).toBe(
      'Add sufficient distilled water and shake until the solid has completely dissolved.',
    );
    expect(en['exp04.stage.dissolution.goal']).toMatch(
      /sufficient distilled water.*completely dissolved/,
    );
    expect(en['exp04.step.add_dissolution_water.instruction']).toMatch(
      /exact minimum volume is not specified/,
    );
    expect(resources.si.translation['ui.form.dissolve_help']).toMatch(/ප්‍රමාණවත් ආසුත ජලය/);
  });
});
