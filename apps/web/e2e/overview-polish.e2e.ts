import { expect, test } from '@playwright/test';
import { en, si, noHorizontalOverflow } from './helpers';

test('overview polish: ordered preparation, accessible references and bilingual layout', async ({
  page,
}, info) => {
  const sizes =
    info.project.name === 'desktop'
      ? [
          [1440, 900],
          [1366, 768],
        ]
      : info.project.name === 'tablet'
        ? [[834, 1112]]
        : [[390, 844]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/');
    await page.getByRole('button', { name: en('ui.card.start') }).click();
    for (const language of ['en', 'si'] as const) {
      const text = language === 'en' ? en : si;
      if (language === 'si') await page.locator('.language-switcher button[lang="si"]').click();
      await expect(
        page.getByRole('heading', { level: 1, name: text('exp04.title') }),
      ).toBeVisible();
      await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      const order = await page
        .locator('.view--overview > section, .overview-preparation > section')
        .evaluateAll((sections) =>
          sections.map((section) => section.getAttribute('aria-labelledby')),
        );
      expect(order).toEqual(['ov-aims', 'ov-materials', 'ov-calc', 'ov-safety']);
      await expect(page.locator('.overview-safety > ul > li')).toHaveCount(8);
      await expect(page.locator('.calculation > li')).toHaveCount(2);
      await expect(page.locator('.overview-apparatus > li')).toHaveCount(7);
      await expect(page.getByRole('button', { name: text('ui.nav.to_prelab') })).toHaveCount(1);
      await noHorizontalOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`${width}-${language}-overview.png`),
        fullPage: true,
      });

      const theory = page.locator('.overview-calculation .overview-disclosure');
      await expect(theory).not.toHaveAttribute('open');
      await theory.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(theory).toHaveAttribute('open', '');
      await expect(theory.locator('ul')).toBeVisible();
      await page.keyboard.press('Enter');

      const sources = page.locator('.overview-safety .overview-sources');
      await sources.locator('summary').focus();
      await page.keyboard.press('Space');
      await expect(sources.locator('.source-list')).toBeVisible();
      await expect(sources).toContainText('2018');
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: info.outputPath(`${width}-${language}-sources.png`),
        fullPage: true,
      });
      await page.keyboard.press('Space');
      await expect(sources).not.toHaveAttribute('open');

      await page.getByRole('button', { name: text('ui.nav.to_prelab') }).click();
      await expect(page.locator('#prelab-title')).toBeVisible();
      await page.getByRole('button', { name: text('ui.nav.back_overview'), exact: true }).click();
    }
  }
});
