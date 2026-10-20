import { expect, test, type Page } from '@playwright/test';
import { en } from './helpers';

/**
 * The practical report has to survive being printed or saved as a PDF — it is the artefact a
 * student or supervisor keeps.
 *
 * `.flow-shell` is a fixed-height app frame (`height: 100dvh`, `overflow: hidden`) with exactly
 * one scrolling region inside it. Correct on screen, fatal on paper: measured under print media
 * the shell reported 900px with `overflow: hidden` and a navy background, so the report printed
 * as a single dark page with everything below the fold cut off, under a printed pager and help
 * button. These assertions pin the print stylesheet that undoes the shell.
 */

/** Drives automatic mode to a real submitted report — the fastest route to printable evidence. */
const runToReport = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.manual_lab') }).click();
  await page.locator('#mode-automatic').check();
  await page.getByRole('button', { name: en('ui.mode.start') }).click();
  await page.getByRole('tab', { name: en('ui.side.protocol') }).click();
  const controls = page.getByRole('group', { name: en('ui.automatic.controls') });
  const step = controls.getByRole('button', { name: en('ui.automatic.next_step'), exact: true });
  for (let i = 0; i < 40 && (await step.isEnabled()); i += 1) {
    await step.click();
    await page.waitForTimeout(120);
  }
  await page
    .getByRole('navigation', { name: en('ui.nav.session') })
    .getByRole('button')
    .nth(4)
    .click();
  await expect(page.getByRole('heading', { level: 1, name: en('ui.report.title') })).toBeVisible();
  await page.waitForTimeout(400);
};

test('the report prints as a full document, not one clipped dark page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one sequential run is enough');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await runToReport(page);

  const onScreen = await page.evaluate(
    () => (document.querySelector('.flow-shell') as HTMLElement).clientHeight,
  );

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(400);

  const printed = await page.evaluate(() => {
    const shell = document.querySelector('.flow-shell') as HTMLElement;
    const body = document.querySelector('.flow-shell__body') as HTMLElement;
    const vis = (s: string) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).display !== 'none' : false;
    };
    return {
      shellH: shell.clientHeight,
      shellOverflow: getComputedStyle(shell).overflowY,
      shellBg: getComputedStyle(shell).backgroundColor,
      bodyOverflow: getComputedStyle(body).overflowY,
      pagerVisible: vis('.flow-pager'),
      helpVisible: vis('.help-widget'),
      barVisible: vis('.flow-shell__bar'),
    };
  });

  // The document must grow well past one viewport instead of being clipped to it.
  expect(printed.shellOverflow, 'shell still clips in print').toBe('visible');
  expect(printed.bodyOverflow, 'body still clips in print').toBe('visible');
  expect(printed.shellH, 'printed report is still one screen tall').toBeGreaterThan(onScreen * 1.5);

  // Paper is white; the navy app frame must not be printed.
  expect(printed.shellBg).toBe('rgb(255, 255, 255)');

  // Navigation chrome is not part of the document.
  expect(printed.pagerVisible, 'pager printed').toBe(false);
  expect(printed.helpVisible, 'help launcher printed').toBe(false);
  expect(printed.barVisible, 'flow bar printed').toBe(false);

  // The evidence the report exists to carry must still be on the page.
  const text = await page.locator('.view--report').innerText();
  expect(text).toContain('1 mol dm');
  expect(text).toMatch(/source/i);
  // The scoring limitation must never be dropped from a printed artefact. The wording comes from
  // the engine's own `disclaimerKey`, so this asserts the rendered notice rather than a fixed key.
  const notice = page.locator('.view--report .notice');
  await expect(notice).toBeVisible();
  expect((await notice.innerText()).trim().length).toBeGreaterThan(20);
});
