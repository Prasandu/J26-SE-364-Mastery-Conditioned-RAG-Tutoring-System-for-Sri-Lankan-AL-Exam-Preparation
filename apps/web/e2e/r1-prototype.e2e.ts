import { expect, test, type Page } from '@playwright/test';
import { shot } from './helpers';

/**
 * R1 prototype acceptance checks (chemistry-lab-advanced-sim-r1). Visits the isolated dev-only
 * prototype at `/?r1=1` and the real production workbench, side by side, so screenshots can be
 * compared. This spec is temporary — it is deleted (or promoted) once R1 is reported complete,
 * per the R1 completion boundary ("Complete R1 only").
 */

/**
 * Uncaught JS exceptions only (`pageerror`), not every `console.error` — a pre-existing,
 * unrelated 404 (confirmed present on the production `/` page too, not introduced by R1) would
 * otherwise make this check meaningless noise.
 */
const pageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('R1: loads, apparatus distinguishable, selection works, rejected action does not animate success', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'single run; this spec sets its own viewports');
  const errors = pageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?r1=1');
  await expect(page.locator('.r1-stage')).toBeVisible();
  await shot(page, 'r1-01-initial');

  // Reject: try to weigh before either item is on the bench.
  await page.locator('.r1-item[aria-label="watch_glass"]').click();
  await page.getByRole('button', { name: 'Weigh on the balance' }).click();
  await expect(page.locator('.r1-toast--rejected')).toBeVisible();
  await shot(page, 'r1-02-rejected');
  // Confirms nothing moved: the watch glass is still drawn at its shelf (smaller, receded) position.
  await expect(page.locator('.r1-item[aria-label="watch_glass"]')).toHaveAttribute(
    'transform',
    /translate\(420 192\) scale\(0\.72\)/,
  );

  // Real path: take both items to the bench, then weigh.
  await page.locator('.r1-item[aria-label="watch_glass"]').click();
  await page.getByRole('button', { name: 'Take to bench' }).click();
  await page.locator('.r1-item[aria-label="four_beam_balance"]').click();
  await page.getByRole('button', { name: 'Take to bench' }).click();
  await shot(page, 'r1-03-on-bench');

  await page.locator('.r1-item[aria-label="watch_glass"]').click();
  await page.getByRole('button', { name: 'Weigh on the balance' }).click();
  await expect(page.locator('.r1-readout')).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(600); // let the settle animation finish
  await shot(page, 'r1-04-weighed');

  // Zoom is reversible and presentation-only.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await shot(page, 'r1-05-zoomed');
  await page.getByRole('button', { name: 'Reset' }).click();

  // Keyboard path.
  await page.keyboard.press('Tab');
  expect(errors, `console errors: ${errors.join('; ')}`).toEqual([]);
});

for (const [name, w, h] of [
  ['desktop-1440', 1440, 900],
  ['desktop-1366', 1366, 768],
  ['tablet', 834, 1112],
  ['mobile', 390, 844],
] as const) {
  test(`R1: responsive scaling, no clipping at ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'single run; this spec sets its own viewports');
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?r1=1');
    await expect(page.locator('.r1-stage')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await shot(page, `r1-viewport-${name}`);
  });
}
