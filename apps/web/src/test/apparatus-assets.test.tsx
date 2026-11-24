import { cleanup, render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SkinnedMesh, Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { APPARATUS_ASSETS, type ApparatusAsset } from '../workbench/scene3d/apparatusAssets';
import { AuthoredFlaskBody } from '../workbench/scene3d/AuthoredFlaskBody';
import {
  clearApparatusModelCache,
  disposeApparatusModel,
  loadApparatusModel,
} from '../workbench/scene3d/loadApparatusModel';

const original = APPARATUS_ASSETS.volumetric_flask;
const manifest = APPARATUS_ASSETS as Record<string, ApparatusAsset>;
const item = { kind: 'volumetric_flask' } as const;
const configure = (values: Partial<ApparatusAsset> = {}) => {
  manifest.volumetric_flask = { ...original, model: '/models/test-flask.glb', ...values };
};
const source = () => {
  const scene = new Group();
  for (const name of ['body', 'neck']) {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.name = name;
    scene.add(mesh);
  }
  return scene;
};
const gltf = (scene: Group) => ({ scene }) as GLTF;

beforeEach(() => {
  configure();
});
afterEach(async () => {
  cleanup();
  clearApparatusModelCache();
  await Promise.resolve();
  manifest.volumetric_flask = original;
  vi.restoreAllMocks();
});

describe('apparatus GLB loading', () => {
  it('uses the current procedural manifest without fetching anything', async () => {
    manifest.volumetric_flask = original;
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
    for (const asset of Object.values(APPARATUS_ASSETS)) {
      expect(asset.model).toBeNull();
      expect(await loadApparatusModel(asset)).toBeNull();
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('fetches once but gives each flask independent scenes, geometry and materials', async () => {
    const raw = source();
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(gltf(raw));
    const [a, b] = await Promise.all([loadApparatusModel(item), loadApparatusModel(item)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
    const first = a!.getObjectByName('body') as Mesh;
    const second = b!.getObjectByName('body') as Mesh;
    expect(first.geometry).not.toBe(second.geometry);
    expect(first.material).not.toBe(second.material);
    new Group().add(a!);
    new Group().add(b!);
    expect(a!.parent).not.toBe(b!.parent);
    const otherDispose = vi.spyOn(second.geometry, 'dispose');
    disposeApparatusModel(a!);
    expect(otherDispose).not.toHaveBeenCalled();
    disposeApparatusModel(b!);
  });

  it('applies pivot before display scale and leaves the cached source untouched', async () => {
    configure({ pivot: [1, 2, 3], unitScale: 2 });
    const raw = source();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(gltf(raw));
    const model = await loadApparatusModel(item);
    expect(model!.scale.toArray()).toEqual([2, 2, 2]);
    expect(model!.children[0]!.position.toArray()).toEqual([-1, -2, -3]);
    expect(raw.position.toArray()).toEqual([0, 0, 0]);
    expect(raw.scale.toArray()).toEqual([1, 1, 1]);
    disposeApparatusModel(model!);
  });

  it.each([0, -1, NaN])('rejects invalid display scale %s before fetching', async (unitScale) => {
    configure({ unitScale });
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
    expect(await loadApparatusModel(item)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('falls back on network errors without repeatedly requesting a broken asset', async () => {
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('404'));
    expect(await loadApparatusModel(item)).toBeNull();
    expect(await loadApparatusModel(item)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each(['missing part', 'empty scene', 'skinned mesh'])('falls back on %s', async (problem) => {
    const raw = problem === 'empty scene' ? new Group() : source();
    if (problem === 'missing part') raw.remove(raw.getObjectByName('neck')!);
    if (problem === 'skinned mesh')
      raw.add(new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial()));
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(gltf(raw));
    expect(await loadApparatusModel(item)).toBeNull();
  });

  it('disposes instance resources but retains shared textures until the cache is cleared', async () => {
    const raw = source();
    const texture = new Texture();
    (raw.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>).material.map = texture;
    const textureDispose = vi.spyOn(texture, 'dispose');
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(gltf(raw));
    const model = await loadApparatusModel(item);
    const body = model!.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
    const geometryDispose = vi.spyOn(body.geometry, 'dispose');
    const materialDispose = vi.spyOn(body.material, 'dispose');
    disposeApparatusModel(model!);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
    clearApparatusModelCache();
    await Promise.resolve();
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('parses a self-contained GLB with Three.js (synthetic test fixture only)', async () => {
    const json = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0, 1] }],
        nodes: [
          { name: 'body', mesh: 0 },
          { name: 'neck', mesh: 0 },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        buffers: [{ byteLength: 36 }],
        bufferViews: [{ buffer: 0, byteLength: 36 }],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: 'VEC3',
            min: [0, 0, 0],
            max: [1, 1, 0],
          },
        ],
      }),
    );
    const padded = Math.ceil(json.length / 4) * 4;
    const data = new ArrayBuffer(12 + 8 + padded + 8 + 36);
    const view = new DataView(data);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, data.byteLength, true);
    view.setUint32(12, padded, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(data, 20, padded).fill(32);
    new Uint8Array(data, 20, json.length).set(json);
    view.setUint32(20 + padded, 36, true);
    view.setUint32(24 + padded, 0x004e4942, true);
    new Float32Array(data, 28 + padded, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const parsed = await new GLTFLoader().parseAsync(data, '');
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(parsed);
    const model = await loadApparatusModel(item);
    expect(model!.getObjectByName('body')).toBeInstanceOf(Mesh);
    expect(model!.getObjectByName('neck')).toBeInstanceOf(Mesh);
    disposeApparatusModel(model!);
  });
});

describe('flask shell fallback lifecycle', () => {
  it('keeps the procedural shell visible after a failed load', async () => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('broken GLB'));
    await act(async () => {
      render(<AuthoredFlaskBody fallback={<span>procedural shell</span>} />);
    });
    expect(screen.getByText('procedural shell')).toBeVisible();
  });

  it('releases a model that finishes loading after unmount', async () => {
    let finish!: (value: GLTF) => void;
    const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const dispose = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const raw = source();
    const view = render(<AuthoredFlaskBody fallback={<span>procedural shell</span>} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => {
      finish(gltf(raw));
    });
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
