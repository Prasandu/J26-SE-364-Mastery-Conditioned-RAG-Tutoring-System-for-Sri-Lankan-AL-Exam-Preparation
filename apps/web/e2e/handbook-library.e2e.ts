import { expect, test } from '@playwright/test';
import handbook from '../../../content/library/handbook-first20.v1.json' with { type: 'json' };
import enHandbook from '../../../content/locales/en/handbook.json' with { type: 'json' };
import siHandbook from '../../../content/locales/si/handbook.json' with { type: 'json' };
import { en, si, noHorizontalOverflow } from './helpers';

test('first 20 practicals distinguish local teaching models from the existing Experiment 4 in both languages', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
  for (const locale of ['en', 'si'] as const) {
    const text = locale === 'en' ? en : si;
    const labels = (locale === 'en' ? enHandbook : siHandbook) as Record<string, unknown>;
    await page.locator(`.language-switcher button[lang="${locale}"]`).click();
    await expect(page.locator('.library-list > article')).toHaveCount(20);
    await expect(page.locator('.handbook-card')).toHaveCount(19);
    await expect(page.getByRole('button', { name: text('ui.card.start') })).toHaveCount(1);
    for (const [i, entry] of handbook.entries.entries()) {
      await expect(page.locator('.library-list > article').nth(i).getByRole('heading')).toHaveText(
        String(labels[entry.titleKey] ?? text(entry.titleKey)),
      );
    }
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: `final-screens/handbook/${info.project.name}-${locale}-library.png`,
      fullPage: true,
    });
    await page.getByLabel(text('ui.library.unit_filter')).selectOption('6');
    await expect(page.locator('.library-list > article')).toHaveCount(12);
    const search = page.getByLabel(text('ui.library.search_label'));
    await search.fill('KMnO₄');
    await expect(page.locator('.library-list > article')).toHaveCount(1);
    await expect(page.getByRole('button', { name: text('ui.card.start') })).toHaveCount(0);
    const details = page.locator('.handbook-card summary');
    await details.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.handbook-card details')).toHaveAttribute('open', '');
    await expect(page.getByText(/75–76/)).toContainText('67–68');
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: `final-screens/handbook/${info.project.name}-${locale}-reference.png`,
    });
    await search.fill('no-such-practical');
    await expect(page.getByText(text('ui.library.no_match_title'))).toBeVisible();
    await page.getByRole('button', { name: text('ui.library.clear_filters') }).click();
    await expect(page.locator('.library-list > article')).toHaveCount(20);
  }
  await page.getByRole('button', { name: si('ui.card.start') }).click();
  await expect(page.getByRole('heading', { level: 1, name: si('exp04.title') })).toBeVisible();
});
