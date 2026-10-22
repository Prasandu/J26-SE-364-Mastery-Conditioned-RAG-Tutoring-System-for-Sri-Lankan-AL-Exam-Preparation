import { expect, test } from '@playwright/test';
import { en, si, noHorizontalOverflow } from './helpers';
import labs from '../../../content/locales/en/labs.json' with { type: 'json' };
import teaching from '../../../content/locales/en/teaching.json' with { type: 'json' };
import { journeyStage } from './practical-journey-helpers';

for (const number of [1, 21]) {
  test(`practical ${number}: explicit skip preserves writing and requires setup safety`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
    const label = number === 1 ? labs['labs.open_named'] : teaching['teaching.open_named'];
    await page
      .getByRole('button', { name: label.replace('{{number}}', String(number)), exact: true })
      .click();
    await journeyStage(page, 'prelab').click();
    await page.getByRole('textbox').first().fill('මගේ මූලික අදහස.');
    await page.getByRole('button', { name: en('ui.journey.skip_prelab'), exact: true }).click();
    const start = page.getByRole('button', { name: en('ui.journey.start'), exact: true });
    await expect(start).toBeDisabled();
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await start.click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
    await journeyStage(page, 'prelab').click();
    await expect(page.getByRole('textbox').first()).toHaveValue('මගේ මූලික අදහස.');
    await noHorizontalOverflow(page);
  });
}

test('Experiment 4: source checks follow the written answer language and allow explicit skip', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
  await page.getByRole('button', { name: en('ui.card.start'), exact: true }).click();
  await page.getByRole('button', { name: en('ui.nav.to_prelab'), exact: true }).click();
  const answer = page.locator('#prelab-q2');
  const field = page.locator('.field').filter({ has: answer });
  await answer.fill('ද්‍රාව්‍යයේ මවුල ප්‍රමාණය ද්‍රාවණයේ පරිමාවෙන් බෙදන්න.');
  await field.getByRole('button', { name: en('ui.answers.check'), exact: true }).click();
  await expect(field.getByRole('status')).toHaveAttribute('lang', 'si');
  await expect(field.getByText(si('ui.answers.matches_guide'), { exact: true })).toBeVisible();
  await answer.fill('c = V/n');
  await expect(field.getByRole('status')).toHaveCount(0);
  await field.getByRole('button', { name: en('ui.answers.check'), exact: true }).click();
  await expect(field.getByText(en('ui.answers.needs_revision'), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: en('ui.journey.skip_prelab'), exact: true }).click();
  await expect(page.getByRole('button', { name: en('ui.mode.start'), exact: true })).toBeDisabled();
  await noHorizontalOverflow(page);
});
