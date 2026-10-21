import { expect, test } from '@playwright/test';
import { en, si, noHorizontalOverflow, startExperiment } from './helpers';

test('graphics: complete blue 2D bench and furnished 3D room in both locales', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const sizes =
    info.project.name === 'desktop'
      ? [
          [1920, 1080],
          [1440, 900],
          [1366, 768],
        ]
      : info.project.name === 'tablet'
        ? [[834, 1112]]
        : [[390, 844]];
  await startExperiment(page, 'manual');
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const lang of ['en', 'si'] as const) {
      const text = lang === 'en' ? en : si;
      await page.locator(`.language-switcher button[lang="${lang}"]`).click();
      for (const renderer of ['2d', '3d'] as const) {
        await page
          .locator('.lab-switch')
          .getByRole('button', { name: text(`ui.lab.renderer_${renderer}`) })
          .click();
        const surface = page.locator(renderer === '2d' ? '.lab2d__svg' : '.lab-canvas canvas');
        await page.locator('.lab-stage').scrollIntoViewIfNeeded();
        await expect(surface).toBeVisible({ timeout: 20_000 });
        await surface.scrollIntoViewIfNeeded();
        if (renderer === '3d')
          await expect(page.locator('.lab3d .lab-toolbar button').first()).toBeEnabled({
            timeout: 15_000,
          });
        const box = await surface.boundingBox();
        expect(box!.height).toBeGreaterThan(150);
        expect(box!.width).toBeGreaterThan(280);
        if (renderer === '2d') {
          const clipped = await surface.evaluate((svg) => {
            const frame = svg.getBoundingClientRect();
            return [...svg.querySelectorAll('[data-lab-item]')]
              .filter((item) => {
                const b = item.getBoundingClientRect();
                return (
                  b.left < frame.left - 2 ||
                  b.right > frame.right + 2 ||
                  b.top < frame.top - 2 ||
                  b.bottom > frame.bottom + 2
                );
              })
              .map((item) => item.getAttribute('data-lab-item'));
          });
          expect(clipped).toEqual([]);
        }
        await noHorizontalOverflow(page);
        // Allow the existing camera preset transition to finish before visual review.
        await page.waitForTimeout(700);
        await page.screenshot({
          path: info.outputPath(`${width}-${lang}-${renderer}.png`),
          animations: 'disabled',
        });
      }
    }
  }
});
