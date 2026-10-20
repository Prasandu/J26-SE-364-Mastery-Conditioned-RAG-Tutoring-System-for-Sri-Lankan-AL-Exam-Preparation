import { expect, test } from '@playwright/test';
import { en, noHorizontalOverflow, shot, startExperiment } from './helpers';

test('seven-section notebook: every section renders, no horizontal overflow at desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startExperiment(page, 'manual');
  await page.waitForTimeout(400);
  await shot(page, 'notebook-01-protocol');

  const rail = page.getByRole('tablist', { name: en('ui.side.label') });
  for (const [id, shotName] of [
    ['context', 'notebook-02-context'],
    ['materials', 'notebook-03-materials'],
    ['predictions', 'notebook-04-predictions'],
    ['results', 'notebook-05-results'],
    ['reflection', 'notebook-06-reflection'],
    ['summary', 'notebook-07-summary'],
  ] as const) {
    await rail.getByRole('tab', { name: en(`ui.side.${id}`) }).click();
    await page.waitForTimeout(150);
    await shot(page, shotName);
  }
  await noHorizontalOverflow(page);
});

test('seven-section notebook: no horizontal overflow at tablet and mobile widths', async ({
  page,
}) => {
  await startExperiment(page, 'manual');
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.waitForTimeout(200);
  await shot(page, 'notebook-tablet');
  await noHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await shot(page, 'notebook-mobile');
  await noHorizontalOverflow(page);
});

test('seven-section notebook: reachable on a phone through the sheet', async ({ page }) => {
  await startExperiment(page, 'manual');
  await page.setViewportSize({ width: 390, height: 844 });

  // On a phone the notebook is a dismissible sheet rather than a column stacked below the stage,
  // so "reachable" now means the trigger opens it — not that the page scrolls far enough.
  const sheet = page.locator('.notebook-sheet');
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: en('ui.side.open_notebook') }).click();
  await expect(sheet).toBeVisible();
  await expect(page.locator('.notebook-sheet .side-panel')).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, 'notebook-mobile-nav');
});
