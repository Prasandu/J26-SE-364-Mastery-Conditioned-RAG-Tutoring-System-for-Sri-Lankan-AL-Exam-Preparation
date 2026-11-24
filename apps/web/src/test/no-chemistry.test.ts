import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** UI code must not calculate chemistry or bypass the engine adapter. */
const src = join(__dirname, '..');
const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'test') walk(p);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
  }
};
walk(src);

describe('UI code contains no chemistry logic', () => {
  it('scans the UI source files', () => expect(files.length).toBeGreaterThan(20));

  it.each(files.map((f) => [relative(src, f), f]))('%s', (_name, file) => {
    const code = readFileSync(file, 'utf8');
    // Official values belong to the experiment definition, never to components.
    expect(code).not.toMatch(/(?<![\w.])(106|26\.5|0\.25|250)(?![\w.])/);
    // Unit conversions are central helpers in simulation-core.
    expect(code).not.toMatch(/[*/]\s*1000\b/);
    // Only the engine adapter may import or call the simulation engine.
    if (file.endsWith(join('engine', 'localAdapter.ts'))) return;
    expect(code).not.toMatch(/from '@vlab\/simulation-core'/);
    expect(code).not.toMatch(/\b(transition|achievedConcentration|buildReport|transferredMassG)\(/);
  });
});
