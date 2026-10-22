import { preparePractical } from './practical-journey-helpers';
import { expect, test, type Page } from '@playwright/test';
import teaching from '../../../content/locales/en/teaching.json' with { type: 'json' };
import admin from '../../../content/locales/en/admin.json' with { type: 'json' };
import labs from '../../../content/locales/en/labs.json' with { type: 'json' };
import { en, noHorizontalOverflow } from './helpers';

const tx = (key: string) => String((teaching as Record<string, unknown>)[`teaching.${key}`]);
const ax = (key: string) => String((admin as Record<string, unknown>)[`admin.${key}`]);
test.use({ actionTimeout: 20_000 });
async function author(page: Page) {
  await page.getByRole('button', { name: ax('nav'), exact: true }).click();
  await page.locator('.admin-sidebar').waitFor({ state: 'attached' });
  const open = page.getByRole('button', { name: ax('navigation.open'), exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole('button', { name: ax('section.simulations'), exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { name: tx('author.title'), exact: true })).toBeVisible();
}

test('no-code model preview, local review, persistence and edit invalidation', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await author(page);
  await page.getByRole('button', { name: tx('author.clone'), exact: true }).click();
  const number = Number(await page.getByLabel(tx('author.number'), { exact: true }).inputValue());
  const title = `Local reviewed practical ${number}`;
  const titles = page.getByRole('group', { name: tx('author.title_field'), exact: true });
  await titles.getByRole('textbox', { name: tx('author.en'), exact: true }).fill(title);
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `final-screens/teaching/${info.project.name}-author-guide.png`,
    fullPage: true,
  });
  const preview = page.getByRole('button', { name: tx('author.preview'), exact: true });
  await preview.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await preparePractical(modal);
  await expect(modal.getByRole('img', { name: tx('scene2d'), exact: true })).toBeVisible();
  await modal.getByRole('button', { name: tx('3d'), exact: true }).click();
  await expect(modal.locator('canvas[data-ready="true"]')).toBeVisible({ timeout: 30_000 });
  await noHorizontalOverflow(page);
  const bounds = await modal.boundingBox();
  expect(bounds?.y).toBeCloseTo(0, 0);
  expect(bounds?.width).toBe(page.viewportSize()!.width);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  await page.screenshot({
    path: `final-screens/teaching/${info.project.name}-author-preview.png`,
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(preview).toBeFocused();
  await page.getByRole('button', { name: tx('author.save'), exact: true }).click();
  await expect(page.getByRole('button', { name: tx('author.save'), exact: true })).toBeDisabled();
  await page.getByRole('button', { name: tx('author.review'), exact: true }).click();
  await expect(page.getByText(tx('author.staged'), { exact: true })).toBeVisible();
  await page.getByLabel(tx('author.reviewer'), { exact: true }).fill('Local browser reviewer');
  await page.getByLabel(tx('author.attest'), { exact: true }).check();
  await page.getByRole('button', { name: tx('author.activate'), exact: true }).click();
  await expect(
    page.getByText(tx('author.active'), { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: tx('author.deactivate'), exact: true }).click();
  await page.getByLabel(tx('author.attest'), { exact: true }).check();
  await expect(
    page.getByRole('button', { name: tx('author.activate'), exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: tx('author.activate'), exact: true }).click();
  await expect(
    page.getByRole('button', { name: tx('author.deactivate'), exact: true }),
  ).toBeEnabled();
  await page.reload();
  await author(page);
  await page.getByLabel(tx('author.saved'), { exact: true }).selectOption({
    label: (await page
      .getByLabel(tx('author.saved'), { exact: true })
      .locator('option')
      .filter({ hasText: title })
      .textContent()) as string,
  });
  await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page
    .getByRole('button', {
      name: tx('open_named').replace('{{number}}', String(number)),
      exact: true,
    })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: String(labs['labs.library']), exact: true }).click();
  await author(page);
  await page.getByLabel(tx('author.saved'), { exact: true }).selectOption({
    label: (await page
      .getByLabel(tx('author.saved'), { exact: true })
      .locator('option')
      .filter({ hasText: title })
      .textContent()) as string,
  });
  await page.getByRole('button', { name: tx('author.guide'), exact: true }).click();
  await page
    .getByRole('group', { name: tx('author.title_field'), exact: true })
    .getByRole('textbox', { name: tx('author.en'), exact: true })
    .fill(`${title} edited`);
  await page.getByRole('button', { name: tx('author.save'), exact: true }).click();
  await expect(page.getByRole('button', { name: tx('author.save'), exact: true })).toBeDisabled();
  await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
  await expect(page.getByRole('heading', { name: `${title} edited`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
});
