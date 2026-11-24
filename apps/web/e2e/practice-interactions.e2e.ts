import { preparePractical } from './practical-journey-helpers';
import { expect, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { en, noHorizontalOverflow } from './helpers';
import labels from '../../../content/locales/en/labs.json' with { type: 'json' };

test('instrument dragging in both renderers preserves the procedure and support placement', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: en('ui.nav.library'), exact: true }).click();
  await page
    .getByRole('button', {
      name: labels['labs.open_named'].replace('{{number}}', '3'),
      exact: true,
    })
    .click();
  await preparePractical(page);
  const instrument = page.locator('[data-practice-instrument="balance"]');
  const initial = await instrument.getAttribute('data-position');
  const box = (await instrument.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 8, { steps: 8 });
  await page.mouse.up();
  await expect(instrument).not.toHaveAttribute('data-position', initial!);
  const moved = (await instrument.getAttribute('data-position'))!;
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: en('ui.practice.view_3d'), exact: true }).click();
  const canvas = page.locator('.teaching-stage canvas[data-ready="true"]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await canvas.scrollIntoViewIfNeeded();
  const frame = (await canvas.boundingBox())!;
  const aspect = frame.width / frame.height;
  const distance = Math.max(9, 13 / Math.max(0.4, aspect));
  const camera = new PerspectiveCamera(38, aspect, 0.1, 70);
  camera.position.set(0, distance * 0.5, distance);
  camera.lookAt(new Vector3(0, 0.8, 0));
  camera.updateMatrixWorld();
  const [x, z] = moved.split(',').map(Number);
  const at = new Vector3(x!, 0.18, z!).project(camera);
  const px = frame.x + ((at.x + 1) * frame.width) / 2;
  const py = frame.y + ((1 - at.y) * frame.height) / 2;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 26, py, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: en('ui.practice.view_2d'), exact: true }).click();
  await expect(instrument).not.toHaveAttribute('data-position', moved);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  const help = page.locator('.help-widget__launcher');
  const helpBox = (await help.boundingBox())!;
  const viewport = page.viewportSize()!;
  const right = viewport.width - helpBox.x - helpBox.width;
  const bottom = viewport.height - helpBox.y - helpBox.height;
  expect(right).toBeGreaterThanOrEqual(8);
  expect(right).toBeLessThanOrEqual(24);
  expect(bottom).toBeGreaterThanOrEqual(8);
  expect(bottom).toBeLessThanOrEqual(24);
  await help.click();
  await expect(page.locator('.practice-support')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `final-screens/models/${info.project.name}-dragging.png`,
    fullPage: true,
  });
});
