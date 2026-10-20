import { expect, test, type Page } from '@playwright/test';
import { startExperiment } from './helpers';

/**
 * The laboratory stage must keep its height when an apparatus is selected.
 *
 * `.scene-frame` is a flex column whose only growing child is `.lab-stage`, so the contextual dock
 * below it used to take its height directly out of the laboratory: measured at 111px lost on every
 * desktop size, which at 1366x768 was 38% of the stage and made every apparatus visibly jump. The
 * dock is now a reserved fixed-height region, so this asserts the stage geometry is unchanged
 * across a selection — the apparatus must not move under the student's cursor mid-drag.
 */

const stageBox = async (page: Page) => {
  const r = await page.locator('.lab-stage').boundingBox();
  return { h: Math.round(r!.height), top: Math.round(r!.y) };
};

const DESKTOP = [
  ['1920x1080', 1920, 1080],
  ['1440x900', 1440, 900],
  ['1366x768', 1366, 768],
] as const;

for (const [name, width, height] of DESKTOP) {
  test(`stage height is unchanged by apparatus selection at ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'explicit viewports are set inside the test');
    await page.setViewportSize({ width, height });
    await startExperiment(page, 'manual');
    await page.waitForTimeout(400);

    const before = await stageBox(page);
    // Selecting an apparatus is what opens the contextual dock.
    await page.locator('[data-lab-item="four_beam_balance"]').click();
    await expect(page.locator('.stage-dock')).toContainText(/.+/);
    await page.waitForTimeout(400);
    const after = await stageBox(page);

    expect(after.h, `${name}: stage height changed on selection`).toBe(before.h);
    expect(after.top, `${name}: stage moved on selection`).toBe(before.top);

    // The stage must also stay a usable size, not merely a stable one.
    expect(before.h, `${name}: stage too short to be usable`).toBeGreaterThan(180);
  });
}
