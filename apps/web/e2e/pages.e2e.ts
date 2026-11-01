import { expect, test } from '@playwright/test';
import { en, noHorizontalOverflow, shot } from './helpers';

// Every student page before the laboratory, at each viewport: usable, no horizontal overflow.
test('student pages: dashboard → library → overview → pre-lab → mode', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-page-1-dashboard`);

  await page.getByRole('button', { name: en('ui.dashboard.browse') }).click();
  await expect(page.getByRole('button', { name: en('ui.card.start') })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-page-2-library`);

  await page.getByRole('button', { name: en('ui.card.start') }).click();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-page-3-overview`);

  await page
    .getByRole('button', { name: en('ui.nav.to_prelab') })
    .first()
    .click();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-page-4-prelab`);

  await page
    .getByRole('button', { name: en('ui.nav.to_mode') })
    .first()
    .click();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-page-5-mode`);
});
