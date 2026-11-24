import { expect, test } from '@playwright/test';
import { en, noHorizontalOverflow, shot, startExperiment } from './helpers';

// A browser with WebGL disabled: 2D must work, and choosing 3D must fall back to 2D.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('without WebGL the 2D laboratory works and 3D falls back to it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'fallback is browser-level, checked once');
  await startExperiment(page, 'manual');
  await expect(page.locator('[data-renderer="2d"]')).toBeVisible();
  await page.locator('[data-lab-item="watch_glass"]').click();
  await expect(page.locator('[data-lab-item="watch_glass"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: en('ui.lab.renderer_3d') }).click();
  await expect(page.getByText(en('ui.canvas.fallback_unsupported'))).toBeVisible();
  await expect(page.locator('[data-renderer="2d"]')).toBeVisible();
  await expect(page.locator('[data-renderer="3d"]')).toHaveCount(0);
  // Selection survives the fallback: the session and UI state are untouched.
  await expect(page.locator('[data-lab-item="watch_glass"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await noHorizontalOverflow(page);
  await shot(page, 'desktop-no-webgl-fallback');
});
