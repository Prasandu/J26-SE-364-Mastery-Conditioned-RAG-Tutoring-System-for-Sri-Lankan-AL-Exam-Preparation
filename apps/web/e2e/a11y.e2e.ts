import { expect, test, type Page } from '@playwright/test';
import { en, startExperiment } from './helpers';

/**
 * Accessibility checks the project has actually been bitten by, written without pulling in an
 * audit dependency: every control needs a name, and names that address different things must not
 * collide (a duplicate "Start a practical" on the dashboard once broke navigation across three
 * Playwright projects because the locator became ambiguous).
 *
 * This is a floor, not a WCAG certification — contrast and reading order still need human review.
 */

/** Controls that carry no accessible name at all. */
const unnamedControls = (page: Page) =>
  page.evaluate(() => {
    const name = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const text = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab?.textContent?.trim()) return lab.textContent.trim();
      }
      if (el.closest('label')?.textContent?.trim()) return '!wrapped';
      if (el.getAttribute('title')?.trim()) return el.getAttribute('title')!.trim();
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const out: string[] = [];
    document
      .querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea')
      .forEach((el) => {
        if (!visible(el)) return;
        if (!name(el)) out.push(`${el.tagName.toLowerCase()}#${el.id || '(no id)'}`);
      });
    return out;
  });

/** Visible button labels that appear more than once on the same screen. */
const duplicateButtonNames = (page: Page) =>
  page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll('button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const n = (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, c]) => c > 1).map(([n, c]) => `${n} x${c}`);
  });

const audit = async (page: Page, where: string) => {
  expect(await unnamedControls(page), `${where}: controls without an accessible name`).toEqual([]);
  expect(await duplicateButtonNames(page), `${where}: duplicate button names`).toEqual([]);
};

test('student pages: every control is named and names are unambiguous', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one pass is enough');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/');
  await audit(page, 'dashboard');
  await page.getByRole('button', { name: en('ui.nav.library') }).click();
  await audit(page, 'library');
  await page.getByRole('button', { name: en('ui.card.start') }).click();
  await audit(page, 'overview');
  await page.getByRole('button', { name: en('ui.nav.to_prelab') }).click();
  await audit(page, 'pre-lab');
  await page.getByRole('button', { name: en('ui.nav.to_mode') }).click();
  await audit(page, 'mode');
});

test('laboratory: apparatus are reachable and operable by keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one pass is enough');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await startExperiment(page, 'manual');
  await audit(page, 'laboratory');

  // The 2D apparatus must be real focusable controls, not decorative SVG.
  const item = page.locator('[data-lab-item="four_beam_balance"]');
  await item.focus();
  await expect(item).toBeFocused();

  // Focus must be visible, not silently removed.
  const outline = await item.evaluate((el) => {
    const cs = getComputedStyle(el, ':focus-visible');
    return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.boxShadow}`;
  });
  expect(outline, 'focused apparatus has no visible focus indicator').not.toBe('none|0px|none');

  // Activating by keyboard opens the contextual dock, exactly as a click does.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('.stage-dock')).toContainText(en('exp04.apparatus.four_beam_balance'));
});
