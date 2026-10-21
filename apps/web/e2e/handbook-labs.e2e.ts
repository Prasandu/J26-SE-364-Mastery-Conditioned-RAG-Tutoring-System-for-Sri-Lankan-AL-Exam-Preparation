import { expect, test } from '@playwright/test';
import enLabs from '../../../content/locales/en/labs.json' with { type: 'json' };
import siLabs from '../../../content/locales/si/labs.json' with { type: 'json' };
import { en, noHorizontalOverflow } from './helpers';

const english = enLabs as Record<string, unknown>;
const sinhala = siLabs as Record<string, unknown>;
for (const number of Array.from({ length: 20 }, (_, i) => i + 1).filter((n) => n !== 4)) {
  test(`practical ${number}: guided procedure, notebook and report`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
    await page
      .getByRole('button', {
        name: String(english['labs.open_named']).replace('{{number}}', String(number)),
        exact: true,
      })
      .click();
    await expect(page.locator('.handbook-lab__scene')).toBeVisible();
    await noHorizontalOverflow(page);
    const checkbox = page.getByRole('checkbox');
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    const repeats = [6, 14, 19, 20].includes(number) ? 3 : 1;
    for (let trial = 0; trial < repeats; trial++) {
      const steps = page.locator('.handbook-lab__steps button');
      const count = await steps.count();
      for (let index = 0; index < count; index++) {
        if (number === 3 && index === 3)
          await page.getByLabel(/Combined balance rider mass/).fill('5');
        await expect(steps.nth(index)).toBeEnabled();
        await steps.nth(index).click();
        await expect(page.getByRole('progressbar')).toHaveAttribute('value', String(index + 1));
      }
      await expect(page.locator('.handbook-lab__results')).toHaveCount(1);
      await page.getByRole('button', { name: String(english['labs.record']), exact: true }).click();
      if (trial < repeats - 1)
        await page
          .getByRole('button', { name: String(english['labs.next_trial']), exact: true })
          .click();
    }
    await page
      .getByRole('button', { name: String(english['labs.tab.notebook']), exact: true })
      .click();
    const notes = page.getByLabel(String(english['labs.notes']), { exact: true });
    await notes.fill(`Trial ${number}\nසිංහල learner notes`);
    await expect(notes).toHaveValue(`Trial ${number}\nසිංහල learner notes`);
    await noHorizontalOverflow(page);
    await page
      .getByRole('button', { name: String(english['labs.tab.experiment']), exact: true })
      .click();
    await page.getByRole('button', { name: String(english['labs.finish']), exact: true }).click();
    await expect(page.getByText(String(english['labs.complete']), { exact: true })).toBeVisible();
    await expect(page.locator('.handbook-lab__document .handbook-lab__results')).toHaveCount(
      repeats,
    );
    await page.screenshot({
      path: `final-screens/models/${info.project.name}-${number}-report-en.png`,
      fullPage: true,
    });
    await page.locator('.language-switcher button[lang="si"]').click();
    await expect(
      page.getByRole('heading', { name: String(sinhala['labs.tab.report']), exact: true }),
    ).toBeVisible();
    await expect(page.locator('.handbook-lab__main')).not.toContainText(
      /labs\.(action|observation|input|scope|reading)\./,
    );
    await noHorizontalOverflow(page);
    await page
      .getByRole('button', { name: String(sinhala['labs.tab.experiment']), exact: true })
      .click();
    await page.screenshot({
      path: `final-screens/models/${info.project.name}-${number}-experiment-si.png`,
      fullPage: true,
    });
    await noHorizontalOverflow(page);
    if (number === 7 && info.project.name === 'desktop') {
      for (const width of [1366, 1920]) {
        await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
        await noHorizontalOverflow(page);
        await page.screenshot({ path: `final-screens/models/${width}-7-si.png`, fullPage: true });
      }
    }
  });
}
