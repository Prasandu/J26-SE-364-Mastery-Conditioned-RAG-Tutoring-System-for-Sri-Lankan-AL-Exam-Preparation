import { expect, test, type Page, type Locator } from '@playwright/test';
import { en, si, startExperiment } from './helpers';

/**
 * Floating and sticky chrome must not cover controls the student has to use.
 *
 * Two real collisions motivated this, both found by measuring rather than by eye:
 *   - the fixed "Need help?" launcher sat on top of the stage zoom cluster below 900px, where the
 *     stage spans the full width and its bottom-right corner reaches the viewport edge;
 *   - in Sinhala the notebook's Save row ended 18px outside the scrolling region, behind the
 *     pager (save bottom 815 vs pager top 797 at 1440x900). English cleared it by 39px, so the
 *     defect existed in one locale only — which is exactly why it needs a test per locale.
 */

const rect = async (l: Locator) => {
  const b = await l.boundingBox();
  expect(b, 'element has no box').not.toBeNull();
  return b!;
};

/** True when two boxes share any area. */
const intersects = (a: Awaited<ReturnType<typeof rect>>, b: Awaited<ReturnType<typeof rect>>) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const openNotebook = async (page: Page, lang: 'en' | 'si') => {
  const name = lang === 'en' ? en('ui.nav.session') : si('ui.nav.session');
  await page.getByRole('navigation', { name }).getByRole('button').nth(2).click();
  await page.waitForTimeout(400);
};

test('help launcher does not cover the stage zoom controls on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
  await page.setViewportSize({ width: 390, height: 844 });
  await startExperiment(page, 'manual');
  await page.waitForTimeout(400);

  const help = await rect(page.locator('.help-widget'));
  const zoom = await rect(page.locator('.lab-zoom'));
  expect(intersects(help, zoom), 'help launcher overlaps the zoom cluster').toBe(false);

  // Both must still be usable, not merely disjoint.
  await expect(page.locator('.help-widget__launcher')).toBeVisible();
  await expect(page.locator('.lab-zoom button').first()).toBeVisible();
});

for (const lang of ['en', 'si'] as const) {
  test(`notebook Save stays clear of the pager in ${lang}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
    await page.setViewportSize({ width: 1440, height: 900 });
    await startExperiment(page, 'manual');
    if (lang === 'si') {
      await page.getByRole('button', { name: 'සිංහල' }).click();
      await page.waitForTimeout(300);
    }
    await openNotebook(page, lang);

    const saveLabel = lang === 'en' ? en('ui.notebook.save') : si('ui.notebook.save');
    const save = page.getByRole('button', { name: saveLabel });
    const saveBox = await rect(save);
    const pagerBox = await rect(page.locator('.flow-pager'));
    const helpBox = await rect(page.locator('.help-widget'));

    expect(intersects(saveBox, pagerBox), `${lang}: Save is behind the pager`).toBe(false);
    expect(intersects(saveBox, helpBox), `${lang}: Save is behind the help launcher`).toBe(false);
    // Reachable by keyboard as well as visible.
    await save.focus();
    await expect(save).toBeFocused();
  });
}
