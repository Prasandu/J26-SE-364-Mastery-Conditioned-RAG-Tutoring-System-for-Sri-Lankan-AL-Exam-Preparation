import { AdminLibrarySchema, AdminStatusSchema } from '@vlab/contracts';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noHorizontalOverflow } from './helpers';

const strings = (lang: 'en' | 'si') =>
  JSON.parse(
    readFileSync(new URL(`../../../content/locales/${lang}/admin.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>;
const EN = strings('en');
const SI = strings('si');
const API = 'http://127.0.0.1:8013/admin/dev';

async function navigate(page: Page, section: string, mobile: boolean, locale = EN) {
  if (mobile) await page.getByRole('button', { name: locale['admin.navigation.open']! }).click();
  await page
    .getByRole('navigation', { name: locale['admin.sections']! })
    .getByRole('button', { name: locale[`admin.section.${section}`]!, exact: true })
    .click();
}

test('admin records: real counts, combined filters and responsive bilingual row details', async ({
  page,
  request,
}, info) => {
  const mobile = info.project.name === 'mobile';
  // Seed only the isolated temporary admin store. No student data, database or AI provider.
  const existing = AdminLibrarySchema.parse(await (await request.get(`${API}/library`)).json());
  if (
    !existing.entries.some(
      (entry) => entry.kind === 'draft' && entry.title === 'Determination of a sample value',
    )
  ) {
    const imported = await request.post(`${API}/imports?kind=guide&filename=synthetic-guide.pdf`, {
      headers: { 'Content-Type': 'application/pdf' },
      data: readFileSync(fileURLToPath(new URL('./fixtures/synthetic-guide.pdf', import.meta.url))),
    });
    expect(imported.ok(), await imported.text()).toBe(true);
  }
  const status = AdminStatusSchema.parse(await (await request.get(`${API}/status`)).json());
  const library = AdminLibrarySchema.parse(await (await request.get(`${API}/library`)).json());

  await page.goto('/');
  await page.getByRole('button', { name: EN['admin.nav']!, exact: true }).click();
  const overview = page.locator('.admin-overview');
  await expect(overview).toBeVisible();
  const values = await overview.locator('.stat__value').allTextContents();
  expect(values).toEqual(
    [
      status.counts.drafts,
      status.counts.needsReview,
      status.counts.contentApproved,
      status.counts.validationFailures,
      status.counts.imports,
    ].map(String),
  );
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true });

  await navigate(page, 'library', mobile);
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel(EN['admin.drafts.status_filter']!).selectOption('published');
  const published = library.entries.filter((entry) => entry.status === 'published');
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(published.length);
  for (const entry of published) {
    const row = page.getByRole('row').filter({ hasText: entry.title });
    await expect(
      row.getByText(EN[entry.runnable ? 'admin.library.runnable' : 'admin.library.not_runnable']!, {
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByLabel(EN['admin.library.search']!).fill('no matching practical here');
  await expect(page.getByText(EN['admin.records.no_match']!, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: EN['admin.records.clear']! }).click();
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(library.entries.length);
  const draftRow = page
    .locator('.admin-records tbody tr')
    .filter({ hasText: 'Determination of a sample value' });
  await expect(
    draftRow.getByText(EN['admin.library.not_runnable']!, { exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('library.png'), fullPage: true });
  await draftRow.locator('.admin-records__actions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('library-row-details.png') });

  await navigate(page, 'drafts', mobile);
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel(EN['admin.drafts.search']!).fill('sample value');
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(1);
  await page.getByLabel(EN['admin.drafts.status_filter']!).selectOption('content_approved');
  await page.getByLabel(EN['admin.drafts.search']!).fill('no matching practical here');
  await expect(page.getByText(EN['admin.drafts.no_match']!, { exact: true })).toBeVisible();
  await expect(page.getByText(EN['admin.drafts.bulk_scope']!, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: EN['admin.records.clear']! }).click();
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(status.counts.drafts);
  await page.getByLabel(EN['admin.drafts.search']!).fill('synthetic-guide.pdf');
  await expect(page.locator('.admin-records tbody tr')).toHaveCount(status.counts.drafts);
  await page.getByRole('button', { name: EN['admin.records.clear']! }).click();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('drafts.png'), fullPage: true });
  const review = page.getByRole('button', {
    name: EN['admin.drafts.open_label']!.replace('{{title}}', 'Determination of a sample value'),
  });
  await review.focus();
  await expect(review).toBeFocused();
  await expect
    .poll(async () =>
      review.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const headerBottom = document.querySelector('.app-header')!.getBoundingClientRect().bottom;
        return (
          rect.top >= headerBottom &&
          el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('draft-review-action.png') });

  await page.locator('.language-switcher button[lang="si"]').click();
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('drafts-sinhala.png'), fullPage: true });
  await navigate(page, 'library', mobile, SI);
  await expect(page.getByRole('table')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('library-sinhala.png'), fullPage: true });
});
