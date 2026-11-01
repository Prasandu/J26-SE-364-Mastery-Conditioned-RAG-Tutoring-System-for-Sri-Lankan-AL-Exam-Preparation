import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { definition } from '../engine/content';
import { buildSceneModel, placementOf } from '../workbench/sceneModel';
import { itemBox, itemPosition, OVERVIEW } from '../workbench/lab2d/layout2d';
import { fittedOverviewPose, itemPosition3D } from '../workbench/scene3d/layout3d';
import { FLASK_PROFILE } from '../workbench/flaskProfile';
import { makeLocalAdapter } from './helpers';

describe('overview apparatus framing', () => {
  const initialModel = async () => {
    const { session } = await makeLocalAdapter(3).createSession({
      mode: 'manual',
      guidanceLevel: null,
      locale: 'en',
      preLab: null,
    });
    return buildSceneModel(session, definition, { pendingApparatus: [], focusedItem: null });
  };

  it('keeps every stored apparatus inside the 2D overview, including the tallest flask', async () => {
    const model = await initialModel();
    for (const item of model.items) {
      const point = itemPosition(item, model);
      const box = itemBox(item, placementOf(item, model));
      expect(point.x - (box.w * point.s) / 2, item.id).toBeGreaterThanOrEqual(OVERVIEW.x);
      expect(point.x + (box.w * point.s) / 2, item.id).toBeLessThanOrEqual(OVERVIEW.x + OVERVIEW.w);
      expect(point.y - box.h * point.s, item.id).toBeGreaterThanOrEqual(OVERVIEW.y);
      expect(point.y, item.id).toBeLessThanOrEqual(OVERVIEW.y + OVERVIEW.h);
    }
  });

  it.each([0.8, 1.2, 1.6, 2.8])(
    'keeps 3D apparatus within the camera at aspect %s',
    async (aspect) => {
      const model = await initialModel();
      const pose = fittedOverviewPose(aspect);
      const camera = new PerspectiveCamera(40, aspect, 0.1, 60);
      camera.position.set(...pose.position);
      camera.lookAt(new Vector3(...pose.target));
      camera.updateMatrixWorld();
      for (const item of model.items) {
        const [x, y, z] = itemPosition3D(item, model);
        const height =
          item.kind === 'volumetric_flask' ? FLASK_PROFILE.at(-1)![1] * item.scale : 1.4;
        for (const point of [
          [x, y, z],
          [x, y + height, z],
        ]) {
          const projected = new Vector3(...point).project(camera);
          expect(Math.abs(projected.x), `${item.id} horizontal`).toBeLessThan(1);
          expect(Math.abs(projected.y), `${item.id} vertical`).toBeLessThan(1);
        }
      }
    },
  );
});
