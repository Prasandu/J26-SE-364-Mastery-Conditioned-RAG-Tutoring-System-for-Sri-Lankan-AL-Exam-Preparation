import { expect, test } from '@playwright/test';
import { en, shot } from './helpers';

/**
 * Automatic mode, which had no end-to-end coverage. Every step is the engine's own
 * `guidance.nextAction` dispatched as a system action, and `advanceAutomaticDemo` stops the run the
 * moment one is not accepted — so "the demonstration reaches the end" is the real assertion here:
 * it proves the canonical procedure chain is completable without a student supplying any parameter.
 */

/** Generous: the chain is ~19 actions and each dispatch re-renders the stage. */
const MAX_STEPS = 40;

test('automatic demonstration runs from the initial state to completion', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sequential demonstration runs once');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.manual_lab') }).click();
  await page.locator('#mode-automatic').check();

  // Watching is not acting: the safety acknowledgement is not demanded before Start.
  await expect(page.getByText(en('ui.mode.automatic_prelab_note'))).toBeVisible();
  const start = page.getByRole('button', { name: en('ui.mode.start') });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page.locator('#workbench-title')).toBeVisible();
  // The demonstration controls sit in the guidance panel, inside the Protocol tab.
  await page.getByRole('tab', { name: en('ui.side.protocol') }).click();
  const controls = page.getByRole('group', { name: en('ui.automatic.controls') });
  await expect(controls).toBeVisible();
  // The student's own action panel is withheld: the system is the actor in this mode.
  await expect(page.locator('#action-form-weigh_watch_glass')).toHaveCount(0);
  // The stage caption is the demonstration one, not the "click an item" interactive one. It is
  // asserted as attached rather than visible: at this viewport `.lab-studio` deliberately hides
  // the caption to give the vertical space to the laboratory, so it is screen-reader text here.
  await expect(page.locator('.scene-frame__caption')).toHaveText(en('ui.stage.caption_automatic'));
  await shot(page, 'automatic-1-start');

  // Let the timed run drive the first steps, then pause: Start/Pause must actually take effect.
  // `exact` matters: "Start" is a substring of "Restart".
  await controls.getByRole('button', { name: en('ui.automatic.start'), exact: true }).click();
  const pause = controls.getByRole('button', { name: en('ui.automatic.pause') });
  await expect(pause).toBeEnabled();
  await page.waitForTimeout(4000);
  await pause.click();
  await expect(pause).toBeDisabled();

  const recorded = () => page.locator('.protocol-panel__events .event').count();
  const afterPause = await recorded();
  expect(afterPause, 'the timed run recorded at least one step').toBeGreaterThan(0);
  // Paused means paused: no further steps land while we wait.
  await page.waitForTimeout(3000);
  expect(await recorded()).toBe(afterPause);
  await shot(page, 'automatic-2-paused');

  // Step the remainder manually so the run is deterministic rather than timing-dependent.
  const step = controls.getByRole('button', { name: en('ui.automatic.next_step'), exact: true });
  let steps = 0;
  while (steps < MAX_STEPS && (await step.isEnabled())) {
    await step.click();
    await page.waitForTimeout(150);
    steps += 1;
  }

  // Completion, by the engine's own account: no next action remains.
  await expect(controls.getByText(en('ui.automatic.finished'))).toBeVisible();
  await expect(step).toBeDisabled();
  await expect(
    controls.getByRole('button', { name: en('ui.automatic.start'), exact: true }),
  ).toBeDisabled();
  await shot(page, 'automatic-3-complete');

  expect(steps, 'the demonstration advanced past the pause').toBeGreaterThan(0);
  // The protocol panel shows only the most recent events, so this is "the log kept advancing",
  // not a count of all 19 steps. The stage assertion below is what proves completion.
  expect(await recorded(), 'the recorded-event log advanced').toBeGreaterThanOrEqual(afterPause);

  // Stopping is not the same as finishing: the engine must report the final stage, and the report
  // must carry the documented concentration. Read from the same places the golden path reads.
  const finalStage = await page.evaluate(
    () => document.querySelector('.protocol-panel__stage')?.textContent?.trim() ?? '',
  );
  console.log(`AUTOLOG steps=${steps} events=${await recorded()} stage=${finalStage}`);
  expect(finalStage).toContain('10');

  const rail = page.getByRole('navigation', { name: en('ui.nav.session') });
  await rail.getByRole('button').nth(4).click();
  await expect(page.getByRole('heading', { level: 1, name: en('ui.report.title') })).toBeVisible();
  await page.waitForTimeout(400);
  // The report has several tables; assert on the concentration row itself.
  await expect(page.getByRole('row').filter({ hasText: 'mol dm' }).first()).toContainText(
    '1 mol dm',
  );
  await shot(page, 'automatic-4-report');
});
