import { expect, type Locator, type Page } from '@playwright/test';
import { en } from './helpers';

export const journeyStage = (scope: Page | Locator, stage: string) =>
  scope
    .getByRole('navigation', { name: en('ui.journey.navigation'), exact: true })
    .getByRole('button', { name: new RegExp(`${en(`ui.journey.${stage}`)}$`) });

export async function preparePractical(scope: Page | Locator) {
  await expect(journeyStage(scope, 'workbench')).toBeDisabled();
  await journeyStage(scope, 'prelab').click();
  await expect(journeyStage(scope, 'setup')).toBeDisabled();
  const fields = scope.locator('.practical-journey').getByRole('textbox');
  for (const field of await fields.all())
    await field.fill('My reasoned preparation and prediction.');
  await journeyStage(scope, 'setup').click();
  const start = scope.getByRole('button', { name: en('ui.journey.start'), exact: true });
  await expect(start).toBeDisabled();
  for (const checkbox of await scope.locator('.practical-journey').getByRole('checkbox').all())
    await checkbox.check();
  await start.click();
  await expect(journeyStage(scope, 'workbench')).toHaveAttribute('aria-current', 'step');
  await expect(journeyStage(scope, 'reflection')).toBeDisabled();
}

export async function reflectAndReport(scope: Page | Locator) {
  await expect(journeyStage(scope, 'report')).toBeDisabled();
  await journeyStage(scope, 'reflection').click();
  for (const field of await scope.locator('.practical-journey').getByRole('textbox').all())
    await field.fill('My reflection using the recorded evidence.');
  await journeyStage(scope, 'report').click();
  await expect(
    scope.getByText('My reflection using the recorded evidence.', { exact: true }).first(),
  ).toBeVisible();
}
