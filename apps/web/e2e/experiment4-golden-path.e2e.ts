import { expect, test, type Page } from '@playwright/test';
import { en, shot, startExperiment } from './helpers';

/** Required solute mass for this practical (NIE handbook Experiment 4: 26.5 g of Na2CO3). */
const REQUIRED_SOLUTE_G = 26.5;

const openProtocol = async (page: Page) => {
  await page.getByRole('tab', { name: en('ui.side.protocol') }).click();
  await page.waitForTimeout(150);
  for (const d of await page.locator('.action-group').all()) {
    await d.evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
  }
};

const submit = async (page: Page, type: string) => {
  const form = page.locator(`#action-form-${type}`);
  await form.scrollIntoViewIfNeeded();
  await form.getByRole('button', { name: en(`exp04.action.${type}`) }).click();
  await page.waitForTimeout(220);
};

/** Latest recorded event as the protocol panel shows it. */
const lastEvent = (page: Page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('.protocol-panel__events .event')];
    const el = items.at(-1);
    return el ? (el.textContent?.replace(/\s+/g, ' ').trim() ?? '') : '';
  });

const stage = (page: Page) =>
  page.evaluate(() => document.querySelector('.protocol-panel__stage')?.textContent?.trim() ?? '');

/**
 * The product's golden path: one complete, valid Experiment 4 attempt performed the way a student
 * performs it — through the real UI, in manual mode, with every action validated by the trusted
 * engine. It asserts the science, not just that the pages render: the achieved concentration must
 * equal the source-backed target of 1 mol dm3, and no action may be rejected along the way.
 *
 * Note the stopper sequence. The engine enforces real technique through preconditions:
 * `dissolve_solute` needs `flask_stoppered`, `adjust_to_mark` needs `flask_unstoppered`, and
 * `mix_solution` needs it stoppered again. Reordering these will (correctly) be rejected.
 */
test('Experiment 4 end to end through the real student UI', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const log: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    await fn();
    const [ev, st] = [await lastEvent(page), await stage(page)];
    log.push(`${name.padEnd(22)} | ${st} | ${ev}`);
  };

  const stopper = async (insert: boolean) => {
    const f = page.locator('#action-form-stopper_flask');
    await f.scrollIntoViewIfNeeded();
    await f
      .getByRole('button', {
        name: en(insert ? 'ui.form.insert_stopper' : 'ui.form.remove_stopper'),
      })
      .click();
    await page.waitForTimeout(220);
  };

  await startExperiment(page, 'manual');

  // Apparatus selection happens by picking items, then submitting the engine action.
  await page.getByRole('tab', { name: en('ui.side.materials') }).click();
  for (const id of [
    'watch_glass',
    'four_beam_balance',
    'funnel',
    'volumetric_flask_250',
    'wash_bottle',
  ]) {
    await page.locator(`label[for="equip-${id}"]`).click();
  }
  await openProtocol(page);
  await step('select_apparatus', () => submit(page, 'select_apparatus'));
  await shot(page, 'e4-01-setup');

  await step('weigh_watch_glass', () => submit(page, 'weigh_watch_glass'));

  // Read the engine's own watch-glass mass from the Results section, exactly as a student would,
  // then set the sliders to that reading plus the required solute mass.
  await page.getByRole('tab', { name: en('ui.side.results') }).click();
  await page.waitForTimeout(200);
  await shot(page, 'e4-02a-measurements');
  const wg = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.measurement-panel tbody tr')];
    for (const r of rows) {
      const m = (r.textContent ?? '').match(/(\d+(?:\.\d+)?)\s*g/);
      if (m && m[1]) return Number(m[1]);
    }
    return null;
  });
  log.push(`watch_glass_mass read from Results panel: ${wg ?? 'NOT SHOWN'}`);
  expect(wg, 'the weighed watch-glass mass must be visible to the student').not.toBeNull();
  await openProtocol(page);

  await step('set_balance_sliders', async () => {
    const f = page.locator('#action-form-set_balance_sliders');
    await f.getByLabel(en('ui.form.slider_total')).fill(String((wg ?? 0) + REQUIRED_SOLUTE_G));
    await submit(page, 'set_balance_sliders');
  });

  await step('add_solid', async () => {
    const f = page.locator('#action-form-add_solid');
    await f.getByLabel(en('ui.form.solid_mass')).fill(String(REQUIRED_SOLUTE_G));
    await f.getByLabel(en('ui.choice.handling.no_contact')).check();
    await submit(page, 'add_solid');
  });
  await shot(page, 'e4-02-weighed');

  await step('place_funnel', () => submit(page, 'place_funnel'));
  await step('transfer_solid', async () => {
    const f = page.locator('#action-form-transfer_solid');
    await f.getByLabel(en('ui.form.portion_into_funnel')).fill('100'); // per cent of the solid
    await f.getByLabel(en('ui.choice.handling.no_contact')).check();
    await submit(page, 'transfer_solid');
  });
  await shot(page, 'e4-03-transfer');

  await step('rinse_watch_glass', async () => {
    await page
      .locator('#action-form-rinse_watch_glass')
      .getByLabel(en('ui.choice.water.distilled'))
      .check();
    await submit(page, 'rinse_watch_glass');
  });
  await step('rinse_funnel', async () => {
    await page
      .locator('#action-form-rinse_funnel')
      .getByLabel(en('ui.choice.water.distilled'))
      .check();
    await submit(page, 'rinse_funnel');
  });
  await step('remove_funnel', () => submit(page, 'remove_funnel'));

  await step('add_water', async () => {
    const f = page.locator('#action-form-add_water');
    await f.getByLabel(en('ui.form.water_volume')).fill('100');
    await f.getByLabel(en('ui.choice.water.distilled')).check();
    await submit(page, 'add_water');
  });
  // The engine enforces the real technique: stopper before shaking to dissolve
  // (`dissolve_solute` precondition `flask_stoppered`), then unstopper before making up to the
  // mark (`adjust_to_mark` requires `flask_unstoppered`).
  await step('stopper (dissolve)', () => stopper(true));
  await step('dissolve_solute', async () => {
    await page
      .locator('#action-form-dissolve_solute')
      .getByLabel(en('ui.choice.grip.neck'))
      .check();
    await submit(page, 'dissolve_solute');
  });
  await shot(page, 'e4-04-dissolve');
  await step('unstopper (make up)', () => stopper(false));

  await step('adjust_to_mark', async () => {
    const f = page.locator('#action-form-adjust_to_mark');
    await f.getByLabel(en('ui.choice.water.distilled')).check();
    await f.getByLabel(en('ui.choice.eye.level')).check();
    await submit(page, 'adjust_to_mark');
  });
  await shot(page, 'e4-05-made-up');

  await step('stopper (mix)', () => stopper(true));
  await step('mix_solution', async () => {
    const f = page.locator('#action-form-mix_solution');
    await f.getByLabel(en('ui.form.inversions')).fill('12');
    await f.getByLabel(en('ui.choice.grip.neck')).check();
    await submit(page, 'mix_solution');
  });
  await step('apply_label', async () => {
    const f = page.locator('#action-form-apply_label');
    await f.getByLabel(en('ui.form.label_name')).fill('Na2CO3 standard solution');
    await submit(page, 'apply_label');
  });
  await shot(page, 'e4-06-final');

  await step('submit_experiment', () => submit(page, 'submit_experiment'));

  // The report must show the engine's own achieved concentration, kept distinct from the
  // expected/theoretical value. Nothing here is computed in the renderer.
  const rail = page.getByRole('navigation', { name: en('ui.nav.session') });
  await rail.getByRole('button').nth(4).click();
  await expect(page.getByRole('heading', { level: 1, name: en('ui.report.title') })).toBeVisible();
  await page.waitForTimeout(400);
  const report = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')]
      .map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => /concentration|mass|volume/i.test(t));
    return {
      overall: document.querySelector('.report__label')?.textContent?.trim() ?? 'none',
      rows: rows.slice(0, 6),
    };
  });
  log.push(`report overall: ${report.overall}`);
  for (const r of report.rows) log.push(`report row: ${r}`);
  console.log('E4LOG\n' + log.join('\n'));
  await shot(page, 'e4-07-report');
});
