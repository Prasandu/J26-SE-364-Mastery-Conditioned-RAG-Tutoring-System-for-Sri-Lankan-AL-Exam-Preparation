import { expect, test, type Page } from '@playwright/test';
import { readFileSync, rmSync } from 'node:fs';
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
const UI = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'content', 'locales', 'en', 'ui.json'), 'utf8'),
) as Record<string, string>;
const uiText = (key: string) => UI[key] ?? key;
const PDF = join(here, 'fixtures', 'synthetic-guide.pdf');

const section = (page: Page, id: string) =>
  page
    .getByRole('navigation', { name: a('admin.sections') })
    .getByRole('button', { name: a(`admin.section.${id}`) });

test.describe.configure({ mode: 'serial' });

/*
 * This serial flow imports the synthetic guide and drives it through review and approval, so it
 * needs a store with no copy of that practical already in it. Other admin specs share one isolated
 * data directory (workers: 1, one LAB_ADMIN_DATA_DIR) and seed the same guide, and this file sorts
 * last, so by the time it runs the store holds a content-duplicate that makes its own import a
 * no-op. Clearing the drafts here makes it self-isolating whatever ran before; the file store globs
 * disk on every read, so the API sees the empty store immediately. The guard mirrors the teardown:
 * only ever the temporary e2e directory is touched, never a real admin store.
 */
test.beforeAll(() => {
  const dir = process.env.VLAB_ADMIN_E2E_DIR;
  if (dir && dir.includes('vlab-admin-e2e-')) {
    rmSync(join(dir, 'drafts'), { recursive: true, force: true });
    rmSync(join(dir, 'audit.jsonl'), { force: true });
  }
});

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
  const titleField = page.locator('#field-title');
  const originalTitle = await titleField.inputValue();
  await titleField.fill(`${originalTitle} `);
  await page.getByRole('button', { name: a('admin.review.save'), exact: true }).click();
  await expect(
    page.locator('#main').getByText(a('admin.review.saved'), { exact: true }),
  ).toBeVisible();
  await expect(titleField).toHaveValue(originalTitle);
  await page.getByRole('button', { name: a('admin.review.revalidate') }).click();
  await expect(
    page.locator('#main').getByText(a('admin.review.validated'), { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: a('admin.action.submit_for_review') }).click();
  await expect(page.locator('#main').getByText(a('admin.review.updated'))).toBeVisible();
  // Review every field that has content (the server requires each to be marked reviewed).
  const fields = page.locator('.admin-field');
  const total = await fields.count();
  for (let i = 0; i < total; i += 1) {
    const field = fields.nth(i);
    if (!(await field.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await field.locator('summary').click();
    }
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

  // Keep the populated review form and its actions reachable at every shell target size.
  for (const field of await page.locator('details.admin-field').all()) {
    if (!(await field.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await field.locator('summary').click();
    }
  }
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const field of await page.locator('details.admin-field').all()) {
      if (!(await field.evaluate((el) => (el as HTMLDetailsElement).open))) {
        await field.locator('summary').click();
      }
    }
    const workspace = page.locator('.admin-review .content-layout');
    await workspace.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    if (width > 1100) {
      const editor = (await workspace.locator('.content-layout__main').boundingBox())!;
      const context = (await workspace.locator('.content-layout__side').boundingBox())!;
      const editorRatio = editor.width / (editor.width + context.width);
      expect(editorRatio).toBeGreaterThan(0.67);
      expect(editorRatio).toBeLessThan(0.73);
      expect(context.y).toBeGreaterThanOrEqual(
        (await page.locator('.app-header').boundingBox())!.height,
      );
    }
    await page.screenshot({ path: info.outputPath(`review-workspace-${width}.png`) });
    const procedure = page.locator('#field-procedure');
    const originalProcedure = await procedure.inputValue();
    await page
      .locator('details.admin-field:has(#field-procedure) summary')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath(`review-editor-${width}.png`) });
    await procedure.fill(`${originalProcedure}\nTemporary layout check`);
    await page.locator('.admin-review__return').click();
    const savebar = page.locator('.admin-review__savebar');
    await expect(savebar).toBeFocused();
    await expect(savebar.getByRole('button', { name: a('admin.review.save') })).toBeEnabled();
    await expect.poll(async () => (await page.locator('.app-header').boundingBox())!.y).toBe(0);
    const headerBox = await page.locator('.app-header').boundingBox();
    const actionsBox = await savebar.boundingBox();
    expect(actionsBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(height);
    const covered = await savebar.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return !el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    expect(covered, 'review actions are covered by another layer').toBe(false);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`review-actions-${width}.png`) });
    await savebar.getByRole('button', { name: a('admin.review.discard') }).click();
    await expect(procedure).toHaveValue(originalProcedure);
  }
  await page.locator('.language-switcher button[lang="si"]').click();
  for (const field of await page.locator('details.admin-field').all()) {
    if (!(await field.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await field.locator('summary').click();
    }
  }
  await page
    .locator('.admin-review .content-layout')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('review-sinhala-390.png') });
  await page.locator('.language-switcher button[lang="en"]').click();
  await page.setViewportSize({ width: 1440, height: 900 });

  // The incomplete practical: Quick fix (bulk) makes it ready, then Approve all ready approves it.
  // Both confirmations are now the themed Chemistry Studio dialog, not a native OS popup, so each
  // is accepted by clicking its Continue button.
  const acceptConfirm = async () => {
    const confirmButton = page
      .locator('.dialog-backdrop .dialog__actions button')
      .getByText(uiText('ui.confirm.continue'), { exact: true });
    await confirmButton.click();
  };
  await section(page, 'drafts').click();
  const bulk = page.getByRole('group', { name: a('admin.quick.bulk') });
  await bulk.getByRole('button', { name: a('admin.quick.fix_all', { count: 1 }) }).click();
  await acceptConfirm();
  await expect(
    page.locator('#main').getByText(a('admin.quick.fixed_all_one', { failed: 0 })),
  ).toBeVisible();
  await bulk.getByRole('button', { name: a('admin.quick.approve_all', { count: 1 }) }).click();
  await acceptConfirm();
  await expect(
    page.locator('#main').getByText(a('admin.quick.approved_all_one', { failed: 0 })),
  ).toBeVisible();
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
  await expect(page.locator('#main').getByText(a('admin.error.invalid_request'))).toBeVisible();
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
    await page.getByRole('button', { name: a('admin.navigation.open') }).click();
    await section(page, id).click();
    await noHorizontalOverflow(page);
  }
  await shot(page, 'admin-mobile');
});
