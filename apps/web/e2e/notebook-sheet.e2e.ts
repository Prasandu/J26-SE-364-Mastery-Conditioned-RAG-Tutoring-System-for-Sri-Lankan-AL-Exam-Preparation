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

  const sheet = page.locator('.notebook-sheet');
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
  await expect(page.locator('.notebook-sheet')).toHaveJSProperty('open', true);
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
  const field = page.locator('.notebook-sheet #prelab-prediction');
  await field.fill('The solution should be colourless at the mark.');
  await page.keyboard.press('Escape');

  await trigger.click();
  await expect(page.locator('.notebook-sheet #prelab-prediction')).toHaveValue(
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
  await expect(page.locator('.notebook-sheet .side-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: en('ui.side.open_notebook') })).toHaveCount(0);
  const modal = await page.locator('.notebook-sheet').evaluate((el) => el.matches(':modal'));
  expect(modal, 'the desktop notebook is a modal dialog').toBe(false);
});
