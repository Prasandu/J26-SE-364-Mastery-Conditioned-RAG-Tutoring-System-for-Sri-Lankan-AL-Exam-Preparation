import { useEffect, useState, type ReactNode } from 'react';
import { Group, Mesh, type Object3D } from 'three';
import { assetModelFor } from './apparatusAssets';
import { disposeApparatusModel, loadApparatusModel } from './loadApparatusModel';

/** Only the glass shell is authored in R1. All experimental state stays in Flask3D. */
function LoadedBody({ fallback }: { fallback: ReactNode }) {
  const [model, setModel] = useState<Group | null>(null);
  useEffect(() => {
    let active = true;
    let owned: Group | null = null;
    void loadApparatusModel({ kind: 'volumetric_flask' }).then((loaded) => {
      if (!loaded) return;
      if (!active) {
        disposeApparatusModel(loaded);
        return;
      }
      // Optional authored state meshes never duplicate or override the live projection.
      loaded.traverse((node) => {
        if (node instanceof Mesh) {
          let part: Object3D | null = node;
          let shell = false;
          while (part) {
            if (
              ['liquid', 'stopper', 'calibration_mark', 'label', 'solid', 'warning'].includes(
                part.name,
              )
            ) {
              shell = false;
              break;
            }
            if (part.name === 'body' || part.name === 'neck') shell = true;
            part = part.parent;
          }
          node.visible = node.visible && shell;
        } else if ('isLight' in node) node.visible = false;
      });
      owned = loaded;
      setModel(loaded);
    });
    return () => {
      active = false;
      if (owned) disposeApparatusModel(owned);
    };
  }, []);
  return model ? <primitive object={model} dispose={null} /> : fallback;
}

export function AuthoredFlaskBody({ fallback }: { fallback: ReactNode }) {
  const path = assetModelFor('volumetric_flask');
  return path ? <LoadedBody key={path} fallback={fallback} /> : fallback;
}
