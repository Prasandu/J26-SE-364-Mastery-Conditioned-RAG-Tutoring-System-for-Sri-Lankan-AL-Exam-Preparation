import { expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { OVERVIEW_POSE, type Vec3 } from '../src/workbench/scene3d/layout3d';

const here = dirname(fileURLToPath(import.meta.url));
const locale = (lang: 'en' | 'si', file: string) =>
  JSON.parse(
    readFileSync(join(here, '..', '..', '..', 'content', 'locales', lang, `${file}.json`), 'utf8'),
  ) as Record<string, string>;

const EN = { ...locale('en', 'ui'), ...locale('en', 'exp04') };
const SI = { ...locale('si', 'ui'), ...locale('si', 'exp04') };
export const en = (key: string): string => EN[key] ?? key;
export const si = (key: string): string => SI[key] ?? key;

/** Screenshots go to a gitignored folder (override with E2E_SCREENS). */
const SCREENS = process.env.E2E_SCREENS ?? join(here, '..', 'test-results', 'screens');
export const shot = async (page: Page, name: string) => {
  mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
};

/** Viewport-only screenshot with the laboratory scrolled into view. */
export const viewShot = async (page: Page, name: string) => {
  mkdirSync(SCREENS, { recursive: true });
  await page.locator('.scene-frame').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SCREENS, `${name}.png`) });
};

/** Starts a session entirely through the UI (header → mode selection → safety → start). */
export const startExperiment = async (
  page: Page,
  mode: 'manual' | 'guided' = 'manual',
  level: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
) => {
  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.manual_lab') }).click();
  await page.locator(`#mode-${mode}`).check();
  if (mode === 'guided') await page.locator(`#level-${level}`).check();
  for (const box of await page.locator('[id^="mode-ack-"]').all()) await box.check();
  await page.getByRole('button', { name: en('ui.mode.start') }).click();
  await expect(page.locator('#workbench-title')).toBeVisible();
};

export const actionButton = (page: Page, type: string) =>
  page.locator(`#action-form-${type}`).getByRole('button', { name: en(`exp04.action.${type}`) });

export const placements2D = (page: Page) =>
  page
    .locator('[data-lab-item]')
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((e) => [e.getAttribute('data-lab-item'), e.getAttribute('data-placement')]),
      ),
    );

export const sceneState3D = async (page: Page) =>
  JSON.parse(
    (await page.locator('[data-renderer="3d"]').getAttribute('data-scene-state')) ?? '{}',
  ) as Record<string, { placement: string; selected: boolean }>;

/** Waits until the 3D camera reports ready (toolbar enabled) and a frame has been drawn. */
export const waitFor3D = async (page: Page) => {
  await expect(page.locator('[data-renderer="3d"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: en('ui.lab.reset_view') })).toBeEnabled({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
};

/** Screen position of a world point under the overview camera (same pose and fov as the app). */
export const projectOverview = async (page: Page, world: Vec3) => {
  const box = (await page.locator('[data-renderer="3d"] canvas').boundingBox())!;
  const camera = new PerspectiveCamera(40, box.width / box.height, 0.1, 60);
  camera.position.set(...OVERVIEW_POSE.position);
  camera.lookAt(new Vector3(...OVERVIEW_POSE.target));
  camera.updateMatrixWorld();
  const p = new Vector3(...world).project(camera);
  return { x: ((p.x + 1) / 2) * box.width, y: ((1 - p.y) / 2) * box.height };
};

/**
 * Checks `document.documentElement.scrollWidth`, plus every element's own bounding rect. The
 * first catches ordinary page overflow; the second is needed because `.flow-shell` (V3-1's
 * fixed-viewport app shell) uses `overflow: hidden` to stop page-level scrolling, which also
 * silently *clips* a too-wide descendant instead of growing `document.documentElement` — so a
 * child stretching past the viewport inside it would pass the first check while still being
 * visibly cut off.
 */
export const noHorizontalOverflow = async (page: Page) => {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const offenders: string[] = [];
    // An element inside its own deliberately horizontally-scrollable region (e.g. the step strip,
    // `overflow-x: auto`) is expected to extend past that region until scrolled — not a bug.
    const inOwnScrollRegion = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    // Only HTML elements, not SVG internals: an SVG clips its own content to its viewBox
    // regardless of a child shape's internal coordinate-space bounding rect (so a decorative
    // illustration's `<path>` can legitimately report a rect far outside the visible page), and
    // `className` on an SVG element is an SVGAnimatedString, not a plain string.
    document.querySelectorAll<HTMLElement>('body *:not(svg *)').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') return; // deliberately viewport-relative
      if (inOwnScrollRegion(el)) return;
      const r = el.getBoundingClientRect();
      // A straddling element (partly visible, extending past an edge) is real overflow; one
      // parked entirely off-canvas (e.g. a skip link at `left: -999px` until focused) is not.
      if (r.width > 0 && r.right > 0 && r.left < vw && (r.right > vw + 1 || r.left < -1)) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${el.className.split(' ').filter(Boolean).join('.')}`,
        );
      }
    });
    return { docOverflow, offenders: offenders.slice(0, 5) };
  });
  expect(result.docOverflow, 'document.documentElement overflows horizontally').toBeLessThanOrEqual(
    1,
  );
  expect(result.offenders, 'elements extend past the viewport width').toEqual([]);
};
