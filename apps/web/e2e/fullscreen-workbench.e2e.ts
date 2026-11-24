import { expect, test } from '@playwright/test';
import { en, si, noHorizontalOverflow, startExperiment } from './helpers';

test('viewport layout keeps the scene, contextual forms and help reachable', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
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
      await page.getByRole('button', { name: text('ui.lab.renderer_2d') }).click();
      if (width! > 900) {
        const header = await page.locator('.flow-shell__bar').boundingBox();
        const scene = await page.locator('.lab-stage').boundingBox();
        expect(header!.height).toBeLessThan(90);
        expect(scene!.height).toBeGreaterThan(height! * 0.75);
        expect(scene!.x).toBe(0);
        expect(scene!.y + scene!.height).toBeCloseTo(height!, 0);
      }
      const description = page.locator('.bench-details summary');
      await description.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.bench-details__content')).toBeVisible();
      await noHorizontalOverflow(page);
      await page.keyboard.press('Enter');
      await page.locator('[data-lab-item="four_beam_balance"]').click();
      const dock = page.locator('.stage-dock');
      const take = dock.getByRole('button', { name: text('ui.stage.take_to_bench') });
      if (await take.isVisible()) await take.click();
      await dock.getByRole('button', { name: text('exp04.action.set_balance_sliders') }).click();
      const dialog = page.getByRole('dialog');
      const field = dialog.getByLabel(text('ui.form.slider_total'));
      await field.fill('42');
      const submit = dialog.getByRole('button', {
        name: text('exp04.action.set_balance_sliders'),
        exact: true,
      });
      await submit.scrollIntoViewIfNeeded();
      expect(
        await submit.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
      ).toBe(true);
      await page.screenshot({ path: `final-screens/fs/${width}-${lang}-actions.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await dock.getByRole('button', { name: text('ui.stage.close_menu') }).click();
      const help = page.locator('.help-widget__launcher');
      await help.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.help-widget__close')).toBeFocused();
      await noHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await expect(help).toBeFocused();
      await page.locator('#main').evaluate((el) => {
        el.scrollTop = 0;
      });
      const scene = await page.locator('.lab-stage').boundingBox();
      expect(
        scene!.y + scene!.height,
        'the scene should use spare viewport height',
      ).toBeGreaterThanOrEqual(height! - 2);
      await page.screenshot({ path: `final-screens/fs/${width}-${lang}-workspace.png` });
    }
  }
});
