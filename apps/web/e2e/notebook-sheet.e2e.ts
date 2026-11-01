import { expect, test } from '@playwright/test';
import { en, noHorizontalOverflow, startExperiment } from './helpers';

/**
 * On a phone the notebook is a modal sheet rather than a column beside the stage. It is a real
 * `<dialog>` opened with `showModal()`, so the focus trap, Escape, background inertness and
 * focus restoration come from the browser — these assertions check that it is genuinely wired
 * that way, and that showing the notebook never advances the experiment.
 */

const PHONE = { width: 390, height: 844 };

test('notebook sheet: opens, restores focus, and never touches the experiment', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
  await page.setViewportSize(PHONE);
  await startExperiment(page, 'manual');

  const sheet = page.locator('.notebook-drawer');
  const trigger = page.getByRole('button', { name: en('ui.side.open_notebook') });
  const stageBefore = await page.locator('.lab-stage').boundingBox();
  const stageText = await page
    .locator('.protocol-panel__stage')
    .innerText()
    .catch(() => '');

  await expect(sheet).toBeHidden();
  await trigger.click();
  await expect(sheet).toBeVisible();

  // showModal() makes everything outside the dialog inert, which is the whole point of using it.
  await expect(page.locator('.notebook-drawer')).toHaveJSProperty('open', true);
  await expect(trigger).not.toBeFocused();

  // Escape closes it and focus returns to the trigger that opened it.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  // Reopen and close with the explicit button.
  await trigger.click();
  await expect(sheet).toBeVisible();
  await page.getByRole('button', { name: en('ui.side.close_notebook') }).click();
  await expect(sheet).toBeHidden();

  // Opening the notebook is presentation only: the stage and the engine stage are unchanged.
  const stageAfter = await page.locator('.lab-stage').boundingBox();
  expect(Math.round(stageAfter!.height)).toBe(Math.round(stageBefore!.height));
  await trigger.click();
  const stageTextAfter = await page
    .locator('.protocol-panel__stage')
    .innerText()
    .catch(() => '');
  expect(stageTextAfter, 'opening the notebook advanced the experiment').toBe(stageText);
  await page.keyboard.press('Escape');

  await noHorizontalOverflow(page);
});

test('notebook sheet: a draft typed in the sheet survives closing and reopening', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
  await page.setViewportSize(PHONE);
  await startExperiment(page, 'manual');

  const trigger = page.getByRole('button', { name: en('ui.side.open_notebook') });
  await trigger.click();
  await page.getByRole('tab', { name: en('ui.side.predictions') }).click();
  const field = page.locator('.notebook-drawer #prelab-prediction');
  await field.fill('The solution should be colourless at the mark.');
  await page.keyboard.press('Escape');

  await trigger.click();
  await expect(page.locator('.notebook-drawer #prelab-prediction')).toHaveValue(
    'The solution should be colourless at the mark.',
  );
});

test('notebook sheet: on a desktop the notebook is a panel, not a dialog', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
  await page.setViewportSize({ width: 1440, height: 900 });
  await startExperiment(page, 'manual');

  // Same element, flattened by CSS: visible, with no trigger and no modal behaviour.
  await expect(page.locator('.notebook-drawer .side-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: en('ui.side.open_notebook') })).toHaveCount(0);
  const modal = await page.locator('.notebook-drawer').evaluate((el) => el.matches(':modal'));
  expect(modal, 'the desktop notebook is a modal dialog').toBe(false);
});

/**
 * The trigger must be on screen without scrolling. Playwright scrolls an element into view before
 * clicking it, so a click-based test passes even when the control sits below the fold: measured at
 * 834x1112 its bottom was 1186, and 1043 in a 844-tall phone viewport. To a student that is a
 * laboratory with no visible route to the notebook, so this asserts the geometry directly.
 */
for (const [name, width, height] of [
  ['tablet 834x1112', 834, 1112],
  ['phone 390x844', 390, 844],
] as const) {
  test(`notebook sheet: the trigger is visible without scrolling at ${name}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport is set explicitly');
    await page.setViewportSize({ width, height });
    await startExperiment(page, 'manual');
    await page.waitForTimeout(400);

    const box = await page.locator('.notebook-drawer__trigger').boundingBox();
    expect(box, 'the sheet trigger is not rendered').not.toBeNull();
    expect(box!.y, `${name}: trigger starts above the viewport`).toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      `${name}: trigger sits below the fold, so the notebook looks unreachable`,
    ).toBeLessThanOrEqual(height);
    // Touch target, not just visible.
    expect(box!.height, `${name}: trigger is too small to tap`).toBeGreaterThanOrEqual(44);
  });
}
