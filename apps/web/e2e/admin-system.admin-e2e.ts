import {
  AdminAuditSchema,
  AdminKnowledgeSchema,
  AdminSettingsSchema,
  AdminTranslationsSchema,
} from '@vlab/contracts';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noHorizontalOverflow } from './helpers';
import { ADMIN_API as API, prepareVersions } from './adminFixtures';

const locale = (lang: 'en' | 'si') =>
  JSON.parse(
    readFileSync(new URL(`../../../content/locales/${lang}/admin.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>;
const EN = locale('en');
const SI = locale('si');

async function navigate(page: Page, section: string, mobile: boolean, strings = EN) {
  if (mobile) await page.getByRole('button', { name: strings['admin.navigation.open']! }).click();
  await page
    .getByRole('navigation', { name: strings['admin.sections']! })
    .getByRole('button', { name: strings[`admin.section.${section}`]!, exact: true })
    .click();
}

test('admin system: active and staged knowledge, teacher review, exact audit and safe settings', async ({
  page,
  request,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await prepareVersions(request);
  const kb = AdminKnowledgeSchema.parse(await (await request.get(`${API}/knowledge`)).json());
  const translations = AdminTranslationsSchema.parse(
    await (await request.get(`${API}/translations`)).json(),
  );
  const audit = AdminAuditSchema.parse(await (await request.get(`${API}/audit`)).json());
  const settings = AdminSettingsSchema.parse(await (await request.get(`${API}/settings`)).json());
  await page.goto('/');
  await page.getByRole('button', { name: EN['admin.nav']!, exact: true }).click();
  await expect(page.locator('.admin-console')).toBeVisible();

  await navigate(page, 'knowledge', mobile);
  await expect(page.locator('.admin-kb__version')).toHaveText(kb.active!.knowledgeVersion);
  await expect(page.locator('.admin-kb__summary .stat__value')).toHaveText(
    String(kb.builds.filter((build) => build.status === 'staged').length),
  );
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('knowledge.png'), fullPage: true });
  const stagedRow = page
    .getByRole('row')
    .filter({ hasText: kb.builds.find((build) => build.status === 'staged')!.knowledgeVersion });
  await stagedRow.getByRole('button', { name: EN['admin.kb.view_chunks']! }).click();
  await expect(page.locator('.admin-chunks')).toBeVisible();
  await stagedRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('knowledge-staged.png') });

  await navigate(page, 'translations', mobile);
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(translations.length);
  for (const file of translations) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: file.file, exact: true }) });
    await expect(row.getByRole('progressbar')).toHaveAttribute(
      'value',
      String(Math.min(file.translated, file.keys)),
    );
    await expect(
      row.getByText(EN[`admin.tr.state.${file.status}`]!, { exact: true }),
    ).toBeVisible();
    await expect(row.getByRole('link')).toHaveAttribute(
      'href',
      new RegExp(`/translations/${file.file}\\.csv$`),
    );
  }
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('translations.png'), fullPage: true });

  await navigate(page, 'audit', mobile);
  const recordToggle = page
    .locator('.admin-audit tbody')
    .getByRole('button', { name: EN['admin.audit.exact_record']! })
    .first();
  await expect(recordToggle).toBeVisible();
  await recordToggle.click();
  const firstRecord = page.locator('.admin-audit__expanded pre').first();
  expect(JSON.parse((await firstRecord.textContent())!)).toEqual(audit.events[0]);
  await noHorizontalOverflow(page);
  await firstRecord.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('audit-exact-record.png') });
  await recordToggle.click();
  await page.screenshot({ path: info.outputPath('audit.png'), fullPage: true });

  await navigate(page, 'settings', mobile);
  const config = page.getByRole('region', { name: EN['admin.settings.title']! });
  await expect(config.getByRole('heading', { name: EN['admin.settings.models']! })).toBeVisible();
  await expect(config).toContainText(settings.environment);
  await expect(config.getByRole('textbox')).toHaveCount(0);
  await expect(config.getByRole('button')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });

  await page.locator('.language-switcher button[lang="si"]').click();
  for (const section of ['knowledge', 'translations', 'audit', 'settings']) {
    await navigate(page, section, mobile, SI);
    await expect(
      page.getByRole('heading', {
        name: SI[
          {
            knowledge: 'admin.kb.title',
            translations: 'admin.tr.title',
            audit: 'admin.audit.title',
            settings: 'admin.settings.title',
          }[section]!
        ]!,
        exact: true,
      }),
    ).toBeVisible();
    await noHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${section}-sinhala.png`), fullPage: true });
  }
});
