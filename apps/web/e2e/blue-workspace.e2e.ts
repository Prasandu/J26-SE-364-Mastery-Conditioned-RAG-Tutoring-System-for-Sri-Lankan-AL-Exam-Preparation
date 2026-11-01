import { expect, test, type Page } from '@playwright/test';
import { en, si, noHorizontalOverflow } from './helpers';

async function exposed(page: Page, selector: string) {
  const field = page.locator(`${selector}:visible`).first();
  await expect(field).toBeVisible();
  await field.focus();
  const result = await field.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const body = document.getElementById('main')!.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      min: body.top,
      max: body.bottom,
      uncovered: element.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      ),
    };
  });
  expect(result.uncovered, JSON.stringify(result)).toBe(true);
  expect(result.top).toBeGreaterThanOrEqual(result.min - 1);
  expect(result.bottom).toBeLessThanOrEqual(result.max + 1);
}

test('blue workspace: complete scenes, reachable writing and consistent bilingual pages', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
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
  const capture = async (name: string) => {
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
  };
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/');
    await expect(page.locator('.experiment-card')).toBeVisible();
    await expect(page.locator('.app-header__subtitle')).not.toContainText('research prototype');
    await capture(`${width}-en-dashboard`);
    await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
    await capture(`${width}-en-library`);
    await page.getByRole('button', { name: en('ui.card.start'), exact: true }).click();
    await capture(`${width}-en-overview`);
    await page.getByRole('button', { name: en('ui.nav.to_prelab'), exact: true }).click();
    await capture(`${width}-en-prelab`);
    await page.getByRole('button', { name: en('ui.nav.to_mode'), exact: true }).click();
    await capture(`${width}-en-mode`);
    await page.locator('#mode-manual').check();
    for (const box of await page.locator('[id^="mode-ack-"]').all()) await box.check();
    await page.getByRole('button', { name: en('ui.mode.start'), exact: true }).click();
    for (const language of ['en', 'si'] as const) {
      const text = language === 'en' ? en : si;
      if (language === 'si') await page.locator('.language-switcher button[lang="si"]').click();
      await expect(page.locator('.flow-pager')).toHaveCount(0);
      if (width! >= 1200) {
        const sections = page.locator('.notebook-nav [role="tab"]');
        await expect(sections).toHaveCount(7);
        for (const [index, section] of [
          'context',
          'materials',
          'predictions',
          'protocol',
          'results',
          'reflection',
          'summary',
        ].entries()) {
          await expect(sections.nth(index)).toHaveText(new RegExp(text(`ui.side.${section}`)));
        }
        const before = await page.locator('.scene-frame').boundingBox();
        await page.locator('.side-panel__collapse').click();
        await expect(page.locator('#side-tab-protocol')).toBeFocused();
        const after = await page.locator('.scene-frame').boundingBox();
        expect(after!.width).toBeGreaterThan(before!.width + 80);
        await capture(`${width}-${language}-expanded-stage`);
        await page.keyboard.press('Enter');
        await expect(page.locator('#side-panel-protocol')).toBeVisible();
        await page.keyboard.press('Home');
        await expect(page.locator('#side-tab-context')).toBeFocused();
        await page.keyboard.press('End');
        await expect(page.locator('#side-tab-summary')).toBeFocused();
        await page.locator('#side-tab-protocol').click();
      }
      await page
        .locator('.lab-switch')
        .getByRole('button', { name: text('ui.lab.renderer_2d') })
        .click();
      await expect(page.locator('.lab2d__svg')).toBeVisible();
      await expect(page.locator('.bench-details')).toBeVisible();
      await page.locator('.lab-stage').scrollIntoViewIfNeeded();
      const sceneBounds = await page.locator('.lab2d__svg').boundingBox();
      const bodyBounds = await page.locator('#main').boundingBox();
      expect(sceneBounds!.height).toBeGreaterThan(150);
      expect(sceneBounds!.height).toBeLessThanOrEqual(bodyBounds!.height);
      expect(sceneBounds!.y).toBeGreaterThanOrEqual(bodyBounds!.y - 1);
      expect(sceneBounds!.y + sceneBounds!.height).toBeLessThanOrEqual(
        bodyBounds!.y + bodyBounds!.height + 1,
      );
      const clipped = await page.locator('.lab2d__svg').evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        return [...svg.querySelectorAll('[data-lab-item]')]
          .filter((item) => {
            const b = item.getBoundingClientRect();
            return (
              b.left < box.left - 2 ||
              b.right > box.right + 2 ||
              b.top < box.top - 2 ||
              b.bottom > box.bottom + 2
            );
          })
          .map((item) => item.getAttribute('data-lab-item'));
      });
      expect(clipped).toEqual([]);
      await capture(`${width}-${language}-2d`);
      await page
        .locator('.lab-switch')
        .getByRole('button', { name: text('ui.lab.renderer_3d') })
        .click();
      // On touch layouts the renderer can begin below the fold; reveal it before waiting for
      // the first WebGL frame and its camera controls.
      await page.locator('.lab-canvas').scrollIntoViewIfNeeded();
      await expect(page.locator('.scene-frame .lab-toolbar button').first()).toBeEnabled({
        timeout: 20_000,
      });
      await expect(page.locator('.lab-canvas canvas')).toBeVisible();
      await page.locator('.lab-canvas').scrollIntoViewIfNeeded();
      await capture(`${width}-${language}-3d`);
      const rail = page.getByRole('navigation', { name: text('ui.nav.session') });
      await rail.getByRole('button').nth(2).click();
      await expect(page.locator('#notebook-title')).toBeVisible();
      await capture(`${width}-${language}-notebook`);
      await exposed(page, '.view--notebook textarea');
      await exposed(page, '.notebook__save button');
      await capture(`${width}-${language}-notebook-save`);
      await page.locator('.help-widget__launcher').click();
      await expect(page.locator('.help-widget__close')).toBeFocused();
      const popup = await page.locator('.help-widget__panel').boundingBox();
      expect(popup!.x).toBeGreaterThanOrEqual(0);
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(width!);
      expect(popup!.y).toBeGreaterThanOrEqual(0);
      await capture(`${width}-${language}-help`);
      await page.keyboard.press('Escape');
      await expect(page.locator('.help-widget__launcher')).toBeFocused();
      await rail.getByRole('button').nth(3).click();
      await capture(`${width}-${language}-reflection`);
      await exposed(page, '.view--reflection textarea');
      await rail.getByRole('button').nth(1).click();
    }
  }
});
