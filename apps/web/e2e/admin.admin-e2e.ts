import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noHorizontalOverflow, shot } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'content', 'locales', 'en', 'admin.json'), 'utf8'),
) as Record<string, string>;
const a = (key: string, vars: Record<string, string | number> = {}) =>
  Object.entries(vars).reduce(
    (text, [k, v]) => text.replace(`{{${k}}}`, String(v)),
    ADMIN[key] ?? key,
  );
const PDF = join(here, 'fixtures', 'synthetic-guide.pdf');

const section = (page: Page, id: string) =>
  page
    .getByRole('navigation', { name: a('admin.sections') })
    .getByRole('button', { name: a(`admin.section.${id}`) });

test.describe.configure({ mode: 'serial' });

test('admin console: import → review → approve → knowledge base → library, users, audit', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'full admin flow runs at desktop width');
  await page.goto('/');
  await page.getByRole('button', { name: a('admin.nav') }).click();
  await expect(page.getByRole('heading', { level: 1, name: a('admin.title') })).toBeVisible();
  await shot(page, 'admin-01-overview');

  // Import the synthetic guide (real upload through the file input).
  await section(page, 'import').click();
  await page.locator('input[type="file"]').setInputFiles(PDF);
  await page.getByRole('button', { name: a('admin.import.start') }).click();
  await expect(page.getByText(/Determination of a sample value/).first()).toBeVisible({
    timeout: 60_000,
  });
  // The same file is imported once only.
  await page.locator('input[type="file"]').setInputFiles(PDF);
  await page.getByRole('button', { name: a('admin.import.start') }).click();
  await shot(page, 'admin-02-import');

  // Review the complete practical and approve its content.
  await section(page, 'drafts').click();
  await page
    .getByRole('button', {
      name: a('admin.drafts.open_label', { title: 'Determination of a sample value' }),
    })
    .click();
  await page.getByRole('button', { name: a('admin.action.submit_for_review') }).click();
  await expect(page.getByText(a('admin.review.updated'))).toBeVisible();
  // Review every field that has content (the server requires each to be marked reviewed).
  const fields = page.locator('.admin-field');
  const total = await fields.count();
  for (let i = 0; i < total; i += 1) {
    const field = fields.nth(i);
    const value = await field.locator('textarea, input[type="text"]').first().inputValue();
    const box = field.locator('.admin-field__review input[type="checkbox"]');
    if (value.trim() && !(await box.isChecked())) {
      // Controlled by the server: it shows checked once the review is recorded.
      await box.click();
      await expect(box).toBeChecked();
      await expect(box).toBeEnabled();
    }
  }
  const approve = page.getByRole('button', { name: a('admin.action.approve_content') });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.locator('.badge--content_approved').first()).toBeVisible();
  await shot(page, 'admin-03-approved');

  // The incomplete practical: Quick fix (bulk) makes it ready, then Approve all ready approves it.
  page.on('dialog', (dialog) => void dialog.accept());
  await section(page, 'drafts').click();
  const bulk = page.getByRole('group', { name: a('admin.quick.bulk') });
  await bulk.getByRole('button', { name: a('admin.quick.fix_all', { count: 1 }) }).click();
  await expect(page.getByText(a('admin.quick.fixed_all_one', { failed: 0 }))).toBeVisible();
  await bulk.getByRole('button', { name: a('admin.quick.approve_all', { count: 1 }) }).click();
  await expect(page.getByText(a('admin.quick.approved_all_one', { failed: 0 }))).toBeVisible();
  await expect(
    page.getByRole('row', { name: /An incomplete practical/ }).locator('.badge--content_approved'),
  ).toBeVisible();
  await shot(page, 'admin-03b-quick-approved');

  // Feed the knowledge base and activate the new version.
  await section(page, 'knowledge').click();
  await page.getByLabel(/Determination of a sample value/).check();
  await page.getByRole('button', { name: a('admin.kb.build') }).click();
  await expect(page.getByText(/new chunks/)).toBeVisible();
  await page
    .getByRole('button', { name: a('admin.kb.activate') })
    .first()
    .click();
  await expect(page.locator('.admin-kb__version')).toContainText('kb-admin-');
  await page
    .getByRole('button', { name: a('admin.kb.view_chunks') })
    .first()
    .click();
  await expect(page.getByText(/Determination of a sample value: Procedure/).first()).toBeVisible();
  await shot(page, 'admin-04-knowledge');

  // Library: the approved practical is in the knowledge base but not runnable for students.
  await section(page, 'library').click();
  const row = page.getByRole('row', { name: /Determination of a sample value/ });
  await expect(row.getByText(a('admin.library.not_runnable'))).toBeVisible();
  await expect(row).toContainText(/\d+ chunks/);
  await shot(page, 'admin-05-library');

  // Users (pseudonymous, roles not enforced).
  await section(page, 'users').click();
  await page.getByLabel(a('admin.users.name')).fill('Learner 07');
  await page.getByRole('button', { name: a('admin.users.create') }).click();
  await expect(page.getByRole('row', { name: /Learner 07/ })).toBeVisible();
  await page.getByLabel(a('admin.users.name')).fill('someone@example.com');
  await page.getByRole('button', { name: a('admin.users.create') }).click();
  await expect(page.getByText(a('admin.error.invalid_request'))).toBeVisible();
  await shot(page, 'admin-06-users');

  // Audit log records everything and its chain verifies.
  await section(page, 'audit').click();
  await expect(page.getByText(a('admin.audit.chain_ok'))).toBeVisible();
  for (const action of [
    'import.created',
    'draft.approve_content',
    'knowledge.built',
    'knowledge.activated',
    'user.created',
  ])
    await expect(page.getByText(action).first()).toBeVisible();
  await shot(page, 'admin-07-audit');

  await section(page, 'settings').click();
  await expect(page.getByRole('heading', { name: a('admin.settings.title') })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, 'admin-08-settings');
});

test('admin console on a phone: navigation and sections stay usable', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout check');
  await page.goto('/');
  await page.getByRole('button', { name: a('admin.nav') }).click();
  await expect(page.getByRole('heading', { level: 1, name: a('admin.title') })).toBeVisible();
  await noHorizontalOverflow(page);
  for (const id of ['library', 'knowledge', 'users', 'audit']) {
    await section(page, id).click();
    await noHorizontalOverflow(page);
  }
  await shot(page, 'admin-mobile');
});
