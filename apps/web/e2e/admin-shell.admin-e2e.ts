import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noHorizontalOverflow } from './helpers';

const locale = (lang: 'en' | 'si') =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../content/locales/${lang}/admin.json`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, string>;
const EN = locale('en');
const SI = locale('si');

async function navigate(page: Page, id: string, mobile: boolean, strings = EN) {
  if (mobile) await page.getByRole('button', { name: strings['admin.navigation.open']! }).click();
  await page
    .getByRole('navigation', { name: strings['admin.sections']! })
    .getByRole('button', { name: strings[`admin.section.${id}`]!, exact: true })
    .click();
  await expect(page.locator('#admin-content')).not.toContainText(strings['admin.loading']!);
}

async function checkImportSpacing(page: Page, strings = EN) {
  await expect(
    page.getByRole('button', { name: strings['admin.environment.label']! }),
  ).toBeVisible();
  await expect(page.locator('.view--admin')).not.toContainText('admin.environment.');
  const blocks = ['.notice', '.mode-options', '.dropzone', '.requirements', '.button-row'];
  let bottom = 0;
  for (const selector of blocks) {
    const box = await page.locator(`.admin-import > ${selector}`).boundingBox();
    expect(box).not.toBeNull();
    if (bottom) expect(box!.y - bottom).toBeGreaterThanOrEqual(16);
    bottom = box!.y + box!.height;
  }
  const documents = await page.locator('#docs-title').boundingBox();
  expect(documents!.y - bottom).toBeGreaterThanOrEqual(24);
  await page.locator('#import-guide').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#import-single')).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#import-guide')).toBeChecked();
  await noHorizontalOverflow(page);
}

test('admin shell: alignment, scrolling, bilingual forms and modal keyboard navigation', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/');
  await page.getByRole('button', { name: EN['admin.nav']!, exact: true }).click();
  await expect(page.locator('.admin-console')).toBeVisible();
  await noHorizontalOverflow(page);
  const header = page.locator('.app-header');
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  if (mobile) {
    const trigger = page.getByRole('button', { name: EN['admin.navigation.open']! });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: EN['admin.sections']! });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: EN['admin.navigation.close']! })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('button', { name: EN['admin.section.settings']! })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: EN['admin.navigation.close']! })).toBeFocused();
    await page.screenshot({ path: info.outputPath('drawer.png') });
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(380, 400);
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  } else {
    const nav = await page.locator('.admin-sidebar').boundingBox();
    const content = await page.locator('#admin-content').boundingBox();
    expect(nav!.x + nav!.width).toBeLessThan(content!.x);
    expect(Math.abs(nav!.y - content!.y)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true });

  for (const id of ['import', 'drafts', 'knowledge', 'users', 'settings']) {
    await navigate(page, id, mobile);
    if (mobile) await expect(page.locator('#admin-content')).toBeFocused();
    if (id === 'import') await checkImportSpacing(page);
    await noHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${id}.png`), fullPage: true });
  }

  // Scroll a long real form and check sticky navigation against the actual header bounds.
  await navigate(page, 'import', mobile);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bounds = await header.boundingBox();
  if (!mobile) {
    const sidebar = await page.locator('.admin-sidebar').boundingBox();
    expect(sidebar!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
    expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(info.project.use.viewport!.height);
  }
  await page.screenshot({ path: info.outputPath('import-scrolled.png') });

  await page.getByRole('button', { name: 'සිංහල', exact: true }).click();
  await navigate(page, 'users', mobile, SI);
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await expect(page.getByLabel(SI['admin.users.name']!, { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('users-sinhala.png'), fullPage: true });

  await navigate(page, 'import', mobile, SI);
  await checkImportSpacing(page, SI);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('import-sinhala.png'), fullPage: true });

  if (mobile) {
    await page.getByRole('button', { name: SI['admin.navigation.open']! }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/admin-drawer-open/);
    await expect(page.locator('.admin-sidebar')).toBeVisible();
  }
});
