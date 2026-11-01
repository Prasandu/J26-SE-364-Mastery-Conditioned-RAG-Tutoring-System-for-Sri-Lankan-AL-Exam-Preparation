import { preparePractical, reflectAndReport, journeyStage } from './practical-journey-helpers';
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
    await preparePractical(page);
    await expect(page.locator('.handbook-lab__scene')).toBeVisible();
    await noHorizontalOverflow(page);
    const checkbox = page.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
    const rail = page.locator('.practice-notebook__rail');
    const protocol = rail.getByRole('button', { name: en('ui.side.protocol'), exact: false });
    const rows = await rail
      .locator('li button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().y));
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1]!);
    await protocol.click();
    await expect(protocol).toHaveAttribute('aria-expanded', 'false');
    await protocol.click();
    await expect(protocol).toHaveAttribute('aria-expanded', 'true');
    const instrument = page.locator('[data-practice-instrument]').first();
    const position = await instrument.getAttribute('data-position');
    const move = page.locator('.practice-move button').nth(1);
    await move.focus();
    await page.keyboard.press('Enter');
    await expect(instrument).not.toHaveAttribute('data-position', position!);
    const moved = await instrument.getAttribute('data-position');
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
    await page.getByRole('button', { name: en('ui.practice.view_3d'), exact: true }).click();
    await expect(page.locator('.teaching-stage canvas[data-ready="true"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: `final-screens/models/${info.project.name}-${number}-3d-en.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: en('ui.practice.view_2d'), exact: true }).click();
    await expect(instrument).toHaveAttribute('data-position', moved!);
    await page.getByRole('button', { name: en('ui.practice.reset_layout'), exact: true }).click();
    const repeats = [6, 14, 19, 20].includes(number) ? 3 : 1;
    for (let trial = 0; trial < repeats; trial++) {
      const steps = page.locator('.handbook-lab__steps button');
      const count = await steps.count();
      for (let index = 0; index < count; index++) {
        if (number === 3 && index === 3) {
          const setup = page.locator('[data-setup-instrument]');
          await setup.click();
          await page
            .getByRole('dialog')
            .getByLabel(/Combined balance rider mass/)
            .fill('5');
          await page.keyboard.press('Escape');
          await expect(setup).toBeFocused();
        }
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
    await journeyStage(page, 'notebook').click();
    const notes = page.getByLabel(String(english['labs.notes']), { exact: true });
    await notes.fill(`Trial ${number}\nසිංහල learner notes`);
    await expect(notes).toHaveValue(`Trial ${number}\nසිංහල learner notes`);
    await noHorizontalOverflow(page);
    await journeyStage(page, 'workbench').click();
    await page.getByRole('button', { name: String(english['labs.finish']), exact: true }).click();
    await reflectAndReport(page);
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
    await page.locator('.practical-journey__nav li').nth(3).getByRole('button').click();
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
