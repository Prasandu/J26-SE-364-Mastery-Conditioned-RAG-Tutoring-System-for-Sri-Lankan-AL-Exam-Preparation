import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ADMIN_API, prepareVersions } from './adminFixtures';
import { noHorizontalOverflow } from './helpers';

const strings = (lang: 'en' | 'si') =>
  JSON.parse(
    readFileSync(new URL(`../../../content/locales/${lang}/admin.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>;
const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [834, 1112],
  [390, 844],
] as const;
const SECTIONS = [
  'overview',
  'library',
  'import',
  'drafts',
  'review',
  'knowledge',
  'users',
  'translations',
  'audit',
  'settings',
] as const;

test.beforeAll(async ({ request }) => {
  await prepareVersions(request);
  const users = (await (await request.get(`${ADMIN_API}/users`)).json()) as { users: unknown[] };
  if (!users.users.length) {
    const created = await request.post(`${ADMIN_API}/users`, {
      data: {
        expectedVersion: null,
        displayName: 'Visual QA learner',
        role: 'student',
        status: 'active',
        note: '',
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
  }
});

async function inspectFields(page: Page) {
  const fields = page.locator(
    '#admin-content input:not([type="file"]), #admin-content textarea, #admin-content select',
  );
  for (const field of await fields.all()) {
    if (!(await field.isVisible()) || !(await field.isEnabled())) continue;
    await field.focus();
    await expect(field).toBeFocused();
    const result = await field.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const header = document.querySelector('.app-header')!.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        id: element.id,
        covered: !element.contains(hit),
        top: box.y,
        bottom: box.bottom,
        headerBottom: header.bottom,
        right: box.right,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });
    expect(result.covered, JSON.stringify(result)).toBe(false);
    expect(result.top, JSON.stringify(result)).toBeGreaterThanOrEqual(result.headerBottom - 1);
    expect(result.bottom, JSON.stringify(result)).toBeLessThanOrEqual(result.viewportHeight + 1);
    expect(result.right, JSON.stringify(result)).toBeLessThanOrEqual(result.viewportWidth + 1);
  }
}

for (const [width, height] of SIZES) {
  for (const language of ['en', 'si'] as const) {
    test(`final admin visual audit ${width} ${language}`, async ({ page }, info) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: strings('en')['admin.nav']!, exact: true }).click();
      await expect(page.locator('.admin-console')).toBeVisible();
      if (language === 'si') await page.locator('.language-switcher button[lang="si"]').click();
      await page.evaluate(() => document.fonts.ready);
      const text = strings(language);
      for (const section of SECTIONS) {
        if (section === 'review') {
          await page
            .getByRole('button', {
              name: text['admin.drafts.open_label']!.replace(
                '{{title}}',
                'Determination of a sample value',
              ),
            })
            .click();
          await expect(page.locator('.admin-review')).toBeVisible();
          const procedure = page.locator('details.admin-field:has(#field-procedure)');
          if (!(await procedure.evaluate((el) => (el as HTMLDetailsElement).open)))
            await procedure.locator('summary').click();
        } else {
          if (width <= 900)
            await page.getByRole('button', { name: text['admin.navigation.open']! }).click();
          await page
            .getByRole('navigation', { name: text['admin.sections']! })
            .getByRole('button', { name: text[`admin.section.${section}`]!, exact: true })
            .click();
        }
        await expect(page.locator('#admin-content .status-message--loading')).toHaveCount(0);
        await expect(page.locator('#admin-content h2').first()).toBeVisible();
        await expect(page.locator('#admin-content .status-message--error')).toHaveCount(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        const environment = page.getByRole('button', { name: text['admin.environment.label']! });
        const information = page.locator('#admin-environment-info');
        await expect(page.locator('.admin-warning')).toHaveCount(0);
        await expect(environment).toHaveCount(1);
        await expect(environment).toHaveAttribute('aria-expanded', 'false');
        await expect(information).toBeHidden();
        await environment.focus();
        await page.keyboard.press('Enter');
        await expect(information).toBeVisible();
        await expect(information.getByRole('listitem')).toHaveCount(4);
        for (const item of ['local', 'approval', 'simulation', 'production'])
          await expect(information).toContainText(text[`admin.environment.${item}`]!);
        const panelBounds = await information.boundingBox();
        const contentBounds = await page.locator('.admin-console').boundingBox();
        expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
        expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width);
        expect(contentBounds!.y).toBeGreaterThanOrEqual(panelBounds!.y + panelBounds!.height);
        await noHorizontalOverflow(page);
        await page.screenshot({
          path: info.outputPath(`${width}-${language}-${section}-environment.png`),
          fullPage: true,
        });
        await page.keyboard.press('Escape');
        await expect(information).toBeHidden();
        await expect(environment).toBeFocused();
        await page.keyboard.press('Space');
        await expect(information).toBeVisible();
        await page.keyboard.press('Space');
        await expect(information).toBeHidden();
        await page.screenshot({
          path: info.outputPath(`${width}-${language}-${section}.png`),
          fullPage: true,
        });
        if (section === 'translations' && width === 1920 && language === 'en') {
          const downloadEvent = page.waitForEvent('download');
          await page
            .locator('#admin-content')
            .getByRole('link', { name: text['admin.tr.download']! })
            .first()
            .click();
          const download = await downloadEvent;
          expect(download.suggestedFilename()).toMatch(/\.csv$/);
          await download.saveAs(info.outputPath('translation-review.csv'));
          expect(await download.failure()).toBeNull();
        }
        await noHorizontalOverflow(page).catch(async (error: unknown) => {
          console.log(
            section,
            await page.locator('#admin-content').evaluate((main) =>
              [...main.querySelectorAll('*')]
                .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 16)
                .map((el) => ({
                  tag: el.tagName,
                  class: el.className,
                  right: el.getBoundingClientRect().right,
                  width: el.getBoundingClientRect().width,
                })),
            ),
          );
          throw error;
        });
        await inspectFields(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`${width}-${language}-${section}.png`),
          fullPage: true,
        });
        if (section === 'review') {
          await page.locator('#field-procedure').focus();
          await page.screenshot({ path: info.outputPath(`${width}-${language}-review-field.png`) });
          await page.locator('.admin-review__return').click();
          await expect(page.locator('#review-save')).toBeFocused();
        }
      }
    });
  }
}
