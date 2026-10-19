import { expect, test, type Page } from '@playwright/test';
import {
  actionButton,
  en,
  noHorizontalOverflow,
  placements2D,
  projectOverview,
  sceneState3D,
  shot,
  si,
  startExperiment,
  viewShot,
  waitFor3D,
} from './helpers';

const switchTo = async (page: Page, view: '2d' | '3d') => {
  await page.getByRole('button', { name: en(`ui.lab.renderer_${view}`) }).click();
  if (view === '3d') await waitFor3D(page);
};

const item2D = (page: Page, id: string) => page.locator(`[data-lab-item="${id}"]`);

/**
 * Real pointer drag in the 2D laboratory from one item onto another (or onto a point). Raw
 * `page.mouse` events, unlike Playwright's own actions, never auto-scroll a target into view, and
 * the stage can be its own scrollable region (V3-1) on a shorter viewport — so both ends are
 * scrolled into view explicitly first, exactly as a real user would need to.
 */
const drag2D = async (page: Page, sourceId: string, target: string | { x: number; y: number }) => {
  await item2D(page, sourceId).scrollIntoViewIfNeeded();
  const from = (await item2D(page, sourceId).boundingBox())!;
  if (typeof target === 'string') await item2D(page, target).scrollIntoViewIfNeeded();
  const to =
    typeof target === 'string'
      ? await item2D(page, target)
          .boundingBox()
          .then((b) => ({ x: b!.x + b!.width / 2, y: b!.y + b!.height * 0.6 }))
      : target;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
};

const recorded = (page: Page) => page.locator('.protocol-panel__events li').count();

test('2D: drag apparatus from the shelf and weigh the watch glass by dragging it onto the balance', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'pointer drag flow runs at desktop width');
  await startExperiment(page, 'manual');
  await shot(page, 'desktop-01-2d-start');
  const start = await recorded(page);

  // Shelf to bench by dragging (select_apparatus).
  await page.locator('.lab2d-bench-target').scrollIntoViewIfNeeded();
  const bench = (await page.locator('.lab2d-bench-target').boundingBox())!;
  await drag2D(page, 'watch_glass', {
    x: bench.x + bench.width * 0.3,
    y: bench.y + bench.height * 0.5,
  });
  await expect(item2D(page, 'watch_glass')).toHaveAttribute('data-placement', 'bench');

  // Shelf to bench through the item menu.
  await item2D(page, 'four_beam_balance').click();
  await expect(page.locator('.stage-dock')).toContainText(en('exp04.apparatus.four_beam_balance'));
  await shot(page, 'desktop-02-2d-item-menu');
  await page.getByRole('button', { name: en('ui.stage.take_to_bench') }).click();
  await expect(item2D(page, 'four_beam_balance')).toHaveAttribute('data-placement', 'bench');

  // Watch glass dragged onto the balance: the engine records weigh_watch_glass.
  await drag2D(page, 'watch_glass', 'four_beam_balance');
  await expect(item2D(page, 'watch_glass')).toHaveAttribute('data-placement', 'on_balance');
  await shot(page, 'desktop-03-2d-weighed');
  expect(await recorded(page)).toBe(Math.min(5, start + 3));

  // A combination with no defined effect: notice, nothing recorded.
  await item2D(page, 'funnel').click();
  await page.getByRole('button', { name: en('ui.stage.take_to_bench') }).click();
  await expect(item2D(page, 'funnel')).toHaveAttribute('data-placement', 'bench');
  const before = await page.locator('.protocol-panel__events').textContent();
  await drag2D(page, 'funnel', 'four_beam_balance');
  await expect(page.getByText(en('ui.gesture.no_effect'))).toBeVisible();
  expect(await page.locator('.protocol-panel__events').textContent()).toBe(before);

  // An engine rejection (the funnel is not on a flask): rejection shown, drawing unchanged.
  const placements = await placements2D(page);
  await item2D(page, 'funnel').click();
  await page
    .locator('.stage-dock__actions')
    .getByRole('button', { name: en('exp04.action.remove_funnel') })
    .click();
  await expect(page.locator('.stage-toast--rejected').first()).toBeVisible();
  expect(await placements2D(page)).toEqual(placements);
  await shot(page, 'desktop-04-2d-rejected');
});

test('3D: pick up the funnel and place it on the flask in the WebGL scene; camera views work', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', '3D interaction flow runs at desktop width');
  await startExperiment(page, 'manual');
  // The equipment tray lives in the Materials notebook section now (V3-2); open it first.
  await page.getByRole('tab', { name: en('ui.side.materials') }).click();
  // Take the flask and funnel to the bench from the equipment tray and item menu.
  for (const id of ['volumetric_flask_250', 'funnel']) {
    await page.locator(`label[for="equip-${id}"]`).click();
    await page.getByRole('button', { name: en('ui.stage.take_to_bench') }).click();
    await expect(item2D(page, id)).toHaveAttribute('data-placement', 'bench');
  }
  const placements2d = await placements2D(page);
  await switchTo(page, '3d');
  await shot(page, 'desktop-05-3d-bench');
  const placements3d = Object.fromEntries(
    Object.entries(await sceneState3D(page)).map(([id, s]) => [id, s.placement]),
  );
  expect(placements3d).toEqual(placements2d);

  // Pick up the funnel (item menu), then click the flask in the 3D scene.
  await page.locator('label[for="equip-funnel"]').click();
  await page.getByRole('button', { name: en('ui.stage.pick_up') }).click();
  await page.waitForTimeout(600);
  await shot(page, 'desktop-06-3d-holding');
  const canvas = page.locator('[data-renderer="3d"] canvas');
  await canvas.click({ position: await projectOverview(page, [0.2, 0.55, 0.3]) });
  await expect.poll(async () => (await sceneState3D(page)).funnel?.placement).toBe('on_flask');
  await page.waitForTimeout(800);
  await shot(page, 'desktop-07-3d-funnel-placed');

  const before = await canvas.screenshot();
  await page.getByRole('button', { name: en('ui.lab.view.mark') }).click();
  await page.waitForTimeout(1200);
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  await shot(page, 'desktop-08-3d-mark-closeup');
  await page.getByRole('button', { name: en('ui.lab.view.balance') }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'desktop-09-3d-balance-closeup');
  await page.getByRole('button', { name: en('ui.lab.reset_view') }).click();
});

test('guided and manual modes expose different assistance', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mode comparison runs at desktop width');
  // Guidance and the full action list now share one notebook section (V3-2: Protocol).
  await startExperiment(page, 'guided', 'beginner');
  await page.getByRole('tab', { name: en('ui.side.protocol') }).click();
  await expect(page.locator('.action-panel__suggested')).toBeVisible();
  await shot(page, 'desktop-10-guided-protocol');

  await startExperiment(page, 'manual');
  await page.getByRole('tab', { name: en('ui.side.protocol') }).click();
  await expect(page.locator('.action-panel__suggested')).toHaveCount(0);
  // The complete action list is still available in manual mode.
  await expect(actionButton(page, 'submit_experiment')).toBeAttached();
  await expect(page.getByText(en('ui.guidance.no_prompt'))).toBeVisible();
});

test('layout: both renderers are usable without horizontal overflow', async ({ page }, info) => {
  await startExperiment(page, 'manual');
  const p = info.project.name;
  await noHorizontalOverflow(page);
  await expect(page.locator('[data-renderer="2d"]')).toBeVisible();
  await page.locator('[data-lab-item="volumetric_flask_250"]').click();
  await shot(page, `${p}-2d-layout`);
  await viewShot(page, `${p}-2d-viewport`);
  await switchTo(page, '3d');
  await noHorizontalOverflow(page);
  await shot(page, `${p}-3d-layout`);
  await viewShot(page, `${p}-3d-viewport`);
});

test('Sinhala: both renderers in Sinhala with the session preserved', async ({ page }, info) => {
  test.skip(info.project.name === 'tablet', 'Sinhala is checked at desktop and mobile widths');
  await startExperiment(page, 'manual');
  const p = info.project.name;
  const recorded = await page.locator('.protocol-panel__events li').count();
  await page.getByRole('button', { name: 'සිංහල' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await expect(page.getByRole('button', { name: si('ui.lab.renderer_2d') })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, `${p}-si-2d`);
  await page.getByRole('button', { name: si('ui.lab.renderer_3d') }).click();
  await expect(page.getByRole('button', { name: si('ui.lab.reset_view') })).toBeEnabled({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  await noHorizontalOverflow(page);
  await shot(page, `${p}-si-3d`);
  await expect(page.locator('.protocol-panel__events li')).toHaveCount(recorded);
});
