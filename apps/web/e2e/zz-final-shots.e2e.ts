import { test, type Page } from '@playwright/test';
import { en, noHorizontalOverflow, shot, si, startExperiment } from './helpers';

const VIEWPORTS = [
  ['1920x1080', 1920, 1080],
  ['1440x900', 1440, 900],
  ['1366x768', 1366, 768],
  ['834x1112', 834, 1112],
  ['390x844', 390, 844],
] as const;

const problems: string[] = [];
const watch = (page: Page, where: string) => {
  page.on('pageerror', (e) => problems.push(`${where}: pageerror ${String(e).slice(0, 120)}`));
};

const audit = async (page: Page, label: string) => {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push('horizontal overflow');
    // Any essential text rendered below 13px is a readability defect.
    for (const el of [...document.querySelectorAll('p,label,li,td,th,button,a')].slice(0, 400)) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs && fs < 13 && (el.textContent ?? '').trim().length > 12) {
        out.push(`tiny text ${fs}px: ${(el.textContent ?? '').trim().slice(0, 40)}`);
        break;
      }
    }
    return out;
  });
  for (const b of bad) problems.push(`${label}: ${b}`);
};

test('final package: pre-session pages at every viewport', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  watch(page, 'pre-session');
  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await shot(page, `final-${name}-01-dashboard`);
    await audit(page, `${name} dashboard`);

    await page.getByRole('button', { name: en('ui.nav.library') }).click();
    await shot(page, `final-${name}-02-library`);
    await audit(page, `${name} library`);

    await page.getByRole('button', { name: en('ui.card.start') }).click();
    await shot(page, `final-${name}-03-overview`);
    await audit(page, `${name} overview`);

    await page.getByRole('button', { name: en('ui.nav.to_prelab') }).click();
    await shot(page, `final-${name}-04-prelab`);
    await audit(page, `${name} prelab`);

    await page.getByRole('button', { name: en('ui.nav.to_mode') }).click();
    await page.locator('#mode-guided').check();
    await shot(page, `final-${name}-05-mode`);
    await audit(page, `${name} mode`);
  }
  console.log('AUDIT-A ' + JSON.stringify(problems, null, 1));
});

test('final package: laboratory, notebook, reflection at every viewport', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  const found: string[] = [];
  page.on('pageerror', (e) => found.push(`pageerror ${String(e).slice(0, 120)}`));
  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await startExperiment(page, 'manual');
    await shot(page, `final-${name}-06-lab2d`);
    await audit(page, `${name} lab2d`);

    await page.getByRole('button', { name: en('ui.lab.renderer_3d') }).click();
    await page.waitForTimeout(1800);
    await shot(page, `final-${name}-07-lab3d`);
    await page.getByRole('button', { name: en('ui.lab.renderer_2d') }).click();

    const rail = page.getByRole('navigation', { name: en('ui.nav.session') });
    await rail.getByRole('button').nth(2).click();
    await page.waitForTimeout(250);
    await shot(page, `final-${name}-08-notebook`);
    await audit(page, `${name} notebook`);

    await rail.getByRole('button').nth(3).click();
    await page.waitForTimeout(250);
    await shot(page, `final-${name}-09-reflection`);
    await audit(page, `${name} reflection`);
  }
  console.log('AUDIT-B ' + JSON.stringify([...problems, ...found], null, 1));
});

test('final package: Sinhala laboratory and notebook', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 1440, height: 900 });
  await startExperiment(page, 'manual');
  await page.getByRole('button', { name: 'සිංහල' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'final-sinhala-lab');
  await noHorizontalOverflow(page);
  // After switching locale the rail's accessible name is Sinhala, so it must be looked up with
  // the Sinhala string — querying the English one is what made this test time out.
  const rail = page.getByRole('navigation', { name: si('ui.nav.session') });
  await rail.getByRole('button').nth(2).click();
  await page.waitForTimeout(300);
  await shot(page, 'final-sinhala-notebook');
  await noHorizontalOverflow(page);
});
