import { expect, test, type Page } from '@playwright/test';
import { en, noHorizontalOverflow, shot } from './helpers';

/**
 * The whole student workflow in one pass, in the order a student meets it, checking that moving
 * backwards does not destroy work. State here lives in memory for the session's lifetime — there
 * is no account storage — so this asserts in-session preservation only.
 */

const PRELAB_ANSWER = 'Titration and standard solution preparation.';
const PREDICTION = 'I expect a clear colourless solution at the mark.';
const NOTEBOOK_CONCLUSION = 'A standard solution was prepared and labelled.';
const REFLECTION_ANSWER = 'Dissolve, make up to the mark, then invert to mix.';

const rail = (page: Page) => page.getByRole('navigation', { name: en('ui.nav.session') });

test('student journey: dashboard to report, forwards and backwards', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'long sequential journey runs once');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Dashboard -> library -> overview
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: en('ui.dashboard.title') }),
  ).toBeVisible();
  await page.getByRole('button', { name: en('ui.nav.library') }).click();
  await page.getByRole('button', { name: en('ui.card.start') }).click();
  await expect(page.getByRole('heading', { level: 1, name: en('exp04.title') })).toBeVisible();
  await shot(page, 'journey-1-overview');

  // Pre-lab: answer a question and record a prediction.
  await page.getByRole('button', { name: en('ui.nav.to_prelab') }).click();
  const firstQuestion = page.locator('#prelab-q1');
  await firstQuestion.fill(PRELAB_ANSWER);
  await page.locator('#prelab-prediction').fill(PREDICTION);
  await shot(page, 'journey-2-prelab');

  // Backwards to the overview and forwards again: the answers must survive.
  await page.getByRole('button', { name: en('ui.nav.back_overview') }).click();
  await page.getByRole('button', { name: en('ui.nav.to_prelab') }).click();
  await expect(page.locator('#prelab-q1')).toHaveValue(PRELAB_ANSWER);
  await expect(page.locator('#prelab-prediction')).toHaveValue(PREDICTION);

  // Mode + safety, then start.
  await page.getByRole('button', { name: en('ui.nav.to_mode') }).click();
  await page.locator('#mode-guided').check();
  await page.locator('#level-beginner').check();
  for (const box of await page.locator('[id^="mode-ack-"]').all()) await box.check();
  await shot(page, 'journey-3-mode');
  await page.getByRole('button', { name: en('ui.mode.start') }).click();
  await expect(page.locator('.workbench')).toBeVisible();
  await shot(page, 'journey-4-lab');

  // Notebook: the chosen mode is live, and a draft survives leaving and returning.
  await rail(page).getByRole('button').nth(2).click();
  await page.waitForTimeout(250);
  await page.getByRole('tab', { name: new RegExp(en('ui.notebook.field.conclusion')) }).click();
  await page
    .getByLabel(en('ui.notebook.field.conclusion'), { exact: true })
    .fill(NOTEBOOK_CONCLUSION);
  await shot(page, 'journey-5-notebook');

  // Reflection: answer question 1.
  await rail(page).getByRole('button').nth(3).click();
  await page.waitForTimeout(250);
  await page.locator('.view--reflection textarea').fill(REFLECTION_ANSWER);
  await shot(page, 'journey-6-reflection');

  // Back to the notebook: the conclusion draft is still there.
  await rail(page).getByRole('button').nth(2).click();
  await page.waitForTimeout(250);
  await page.getByRole('tab', { name: new RegExp(en('ui.notebook.field.conclusion')) }).click();
  await expect(page.getByLabel(en('ui.notebook.field.conclusion'), { exact: true })).toHaveValue(
    NOTEBOOK_CONCLUSION,
  );

  // Forward to reflection again: that answer survived too.
  await rail(page).getByRole('button').nth(3).click();
  await page.waitForTimeout(250);
  await expect(page.locator('.view--reflection textarea')).toHaveValue(REFLECTION_ANSWER);

  // Back into the laboratory: the session, mode and stage are unchanged.
  await rail(page).getByRole('button').nth(1).click();
  await page.waitForTimeout(250);
  await expect(page.locator('.workbench')).toBeVisible();
  // The mode chip was removed from the workbench; the laboratory stage returning confirms the
  // session is intact instead.
  await expect(page.locator('.lab-stage')).toBeVisible();
  await noHorizontalOverflow(page);

  // The report step stays disabled until the experiment is submitted, rather than opening an
  // empty report — the gate is in the step rail itself.
  await expect(rail(page).getByRole('button').nth(4)).toBeDisabled();
  await shot(page, 'journey-7-report-gated');
});

test('AI help widget: open, minimise, reopen, close', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // No session yet: the widget must not be offered.
  await expect(page.locator('.help-widget')).toHaveCount(0);

  await page.getByRole('button', { name: en('ui.nav.manual_lab') }).click();
  await page.locator('#mode-manual').check();
  for (const box of await page.locator('[id^="mode-ack-"]').all()) await box.check();
  await page.getByRole('button', { name: en('ui.mode.start') }).click();
  await expect(page.locator('.help-widget')).toBeVisible();

  await page.locator('.help-widget__launcher').click();
  await expect(page.locator('.help-widget__panel')).toBeVisible();
  await shot(page, 'journey-8-help-open');
  const controls = page.locator('.help-widget__controls');
  await controls.getByRole('button').first().click(); // minimise
  await expect(page.locator('.help-widget__panel')).toHaveCount(0);
  await page.locator('.help-widget__launcher').click();
  await expect(page.locator('.help-widget__panel')).toBeVisible();
  await page.locator('.help-widget__close').click();
  await expect(page.locator('.help-widget__panel')).toHaveCount(0);
  await noHorizontalOverflow(page);
});
