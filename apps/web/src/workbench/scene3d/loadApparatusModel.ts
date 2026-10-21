import { Group, Mesh, SkinnedMesh, type Material } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Texture } from 'three';
import type { SceneItem } from '../sceneModel';
import { APPARATUS_ASSETS } from './apparatusAssets';

let loader: GLTFLoader | null = null;
// Cache the source, not a mounted object: Three objects can have only one parent.
const cache = new Map<string, Promise<Group | null>>();

const readSource = async (path: string): Promise<Group | null> => {
  try {
    if (!loader) {
      const { GLTFLoader: Loader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      loader = new Loader();
    }
    return (await loader.loadAsync(path)).scene;
  } catch {
    return null;
  }
};

/** Release an instance's geometry/materials. Textures belong to the cached source. */
export function disposeApparatusModel(model: Group): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  model.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/**
 * Fetch once per path, then return an independently owned static model per apparatus.
 * Missing, malformed or unsupported assets leave the procedural renderer available.
 * Paths come only from the local manifest; experiment data cannot supply model URLs.
 */
export async function loadApparatusModel(item: Pick<SceneItem, 'kind'>): Promise<Group | null> {
  const asset = APPARATUS_ASSETS[item.kind];
  if (!asset?.model) return null;
  if (
    !Number.isFinite(asset.unitScale) ||
    asset.unitScale <= 0 ||
    !asset.pivot.every(Number.isFinite)
  )
    return null;
  let source = cache.get(asset.model);
  if (!source) {
    source = readSource(asset.model);
    cache.set(asset.model, source);
  }
  const scene = await source;
  if (!scene) return null;
  let meshes = 0;
  let skinned = false;
  scene.traverse((node) => {
    if (node instanceof Mesh) meshes += 1;
    if (node instanceof SkinnedMesh) skinned = true;
  });
  if (!meshes || skinned) return null;
  for (const part of asset.parts.filter((part) => part.required)) {
    const node = scene.getObjectByName(part.name);
    let hasMesh = false;
    node?.traverse((child) => {
      if (child instanceof Mesh && child.visible && child.geometry.getAttribute('position')?.count)
        hasMesh = true;
    });
    if (!hasMesh || !node?.visible) return null;
  }

  const clone = scene.clone(true);
  clone.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry = node.geometry.clone();
    node.material = Array.isArray(node.material)
      ? node.material.map((material) => material.clone())
      : node.material.clone();
  });
  clone.position.x -= asset.pivot[0];
  clone.position.y -= asset.pivot[1];
  clone.position.z -= asset.pivot[2];
  const model = new Group();
  model.scale.setScalar(asset.unitScale);
  model.add(clone);
  return model;
}

/** Test helper. Call only after all mounted model instances have been released. */
export function clearApparatusModelCache(): void {
  for (const source of cache.values())
    void source.then((scene) => {
      if (!scene) return;
      const textures = new Set<Texture>();
      scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          for (const value of Object.values(material))
            if (value instanceof Texture) textures.add(value);
      });
      disposeApparatusModel(scene);
      textures.forEach((texture) => texture.dispose());
    });
  cache.clear();
  loader = null;
}
