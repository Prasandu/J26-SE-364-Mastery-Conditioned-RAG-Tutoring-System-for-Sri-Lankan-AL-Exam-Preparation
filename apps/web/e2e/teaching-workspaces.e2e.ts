import { preparePractical, reflectAndReport, journeyStage } from './practical-journey-helpers';
import { expect, test } from '@playwright/test';
import raw from '../../../content/experiments/teaching/handbook21-30.v1.json' with { type: 'json' };
import english from '../../../content/locales/en/teaching.json' with { type: 'json' };
import sinhala from '../../../content/locales/si/teaching.json' with { type: 'json' };
import enLabs from '../../../content/locales/en/labs.json' with { type: 'json' };
import { en, noHorizontalOverflow } from './helpers';
const tx = (key: string) => String((english as Record<string, unknown>)[`teaching.${key}`]);
const si = (key: string) => String((sinhala as Record<string, unknown>)[`teaching.${key}`]);
for (const d of raw) {
  test(`practical ${d.experimentNumber}: guide, 2D/3D apparatus and entered-data report`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
    await page
      .getByRole('button', {
        name: tx('open_named').replace('{{number}}', String(d.experimentNumber)),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: d.title.en, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(d.limitations.en, { exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await preparePractical(page);
    if (d.experimentNumber === 29) {
      await page.locator('[data-setup-instrument]').click();
      await page.getByRole('dialog').getByRole('spinbutton').fill('2');
      await page
        .getByRole('button', { name: en('ui.practice.save_settings'), exact: true })
        .click();
    }
    for (const [i, step] of d.tests[0]!.steps.entries()) {
      if (d.experimentNumber === 30 && step.effect === 'measure') {
        await page.locator('[data-setup-instrument]').click();
        const fields = page.getByRole('dialog').getByRole('spinbutton');
        for (const [j, c] of d.concentrationsMolDm3.entries()) {
          await expect(fields.nth(j)).toBeEmpty();
          await fields.nth(j).fill(String(100 / c));
        }
        await page
          .getByRole('button', { name: en('ui.practice.save_settings'), exact: true })
          .click();
      }
      const index = d.apparatus.findIndex((a) => a.id === step.apparatusId),
        a = d.apparatus[index]!;
      await page.getByRole('button', { name: `${index + 1}. ${a.label.en}`, exact: true }).click();
      await page.getByRole('button', { name: tx('perform_step'), exact: true }).click();
      await expect(page.getByRole('progressbar')).toHaveAttribute('value', String(i + 1));
    }
    await page.screenshot({
      path: `final-screens/teaching/${info.project.name}-${d.experimentNumber}-2d-en.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: tx('3d'), exact: true }).click();
    const canvas = page.locator('.teaching-stage canvas[data-ready="true"]');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tx('webgl_fallback'), { exact: true })).toBeHidden();
    await page.getByRole('button', { name: tx('reset_view'), exact: true }).click();
    await noHorizontalOverflow(page);
    await page.locator('.language-switcher button[lang="si"]').click();
    await expect(
      page.getByRole('heading', { level: 1, name: d.title.si, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'value',
      String(d.tests[0]!.steps.length),
    );
    await page.screenshot({
      path: `final-screens/teaching/${info.project.name}-${d.experimentNumber}-3d-si.png`,
      fullPage: true,
    });
    await page.locator('.language-switcher button[lang="en"]').click();
    await page.getByRole('button', { name: String(enLabs['labs.record']), exact: true }).click();
    await journeyStage(page, 'notebook').click();
    const notes = page.getByLabel(String(enLabs['labs.notes']), { exact: true });
    await notes.fill(`Practical ${d.experimentNumber}\nසිංහල notes`);
    await journeyStage(page, 'workbench').click();
    await page.getByRole('button', { name: String(enLabs['labs.finish']), exact: true }).click();
    await reflectAndReport(page);
    await expect(
      page.getByText(`Practical ${d.experimentNumber}\nසිංහල notes`, { exact: true }),
    ).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: `final-screens/teaching/${info.project.name}-${d.experimentNumber}-report.png`,
      fullPage: true,
    });
    await page.locator('.language-switcher button[lang="si"]').click();
    await expect(
      page.getByRole('heading', { level: 2, name: si('tab.report'), exact: true }),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      /teaching\.(author|error|tab|instrument|scope)\./,
    );
  });
}
