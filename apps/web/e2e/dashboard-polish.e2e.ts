import { expect, test } from '@playwright/test';
import { en, si, noHorizontalOverflow } from './helpers';

test('dashboard polish: bilingual responsive cards, navigation and reduced motion', async ({
  page,
}, info) => {
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
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/');
    for (const language of ['en', 'si'] as const) {
      const text = language === 'en' ? en : si;
      if (language === 'si') await page.locator('.language-switcher button[lang="si"]').click();
      await expect(
        page.getByRole('heading', { level: 1, name: text('ui.dashboard.title') }),
      ).toBeVisible();
      await expect(page.locator('.experiment-card')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      if (width! > 1100 && language === 'si') {
        const brand = await page.locator('.app-header__brand').boundingBox();
        expect(brand!.width).toBeGreaterThanOrEqual(320);
      }
      const hero = await page.locator('.view--dashboard .page-header').boundingBox();
      const browse = page.getByRole('button', { name: text('ui.dashboard.browse') });
      const cta = await browse.boundingBox();
      expect(cta!.x).toBeGreaterThanOrEqual(hero!.x);
      expect(cta!.x + cta!.width).toBeLessThanOrEqual(hero!.x + hero!.width);
      expect(cta!.y + cta!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
      const art = page.locator('.view--dashboard .page-header__media');
      if (await art.isVisible()) {
        const image = await art.boundingBox();
        const copy = await page.locator('.view--dashboard .page-header__text').boundingBox();
        expect(copy!.x + copy!.width).toBeLessThanOrEqual(image!.x);
        expect(cta!.x + cta!.width).toBeLessThanOrEqual(image!.x);
      }
      const card = await page.locator('.experiment-card').boundingBox();
      const open = page.getByRole('button', { name: text('ui.card.start') });
      const action = await open.boundingBox();
      expect(action!.x + action!.width).toBeLessThanOrEqual(card!.x + card!.width);
      expect(action!.y + action!.height).toBeLessThanOrEqual(card!.y + card!.height);
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: info.outputPath(`${width}-${language}-dashboard.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await browse.focus();
      await expect(browse).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { level: 1, name: text('ui.library.title') }),
      ).toBeVisible();
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: info.outputPath(`${width}-${language}-library.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.getByRole('button', { name: text('ui.card.start') }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: text('exp04.title') }),
      ).toBeVisible();
      await page.getByRole('button', { name: text('ui.nav.dashboard'), exact: true }).click();
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.view--dashboard .page-header')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.dashboard__catalog')).toHaveCSS('animation-name', 'none');
});
