import { useEffect, useMemo } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  LatheGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  FLASK_MARK_Y,
  FLASK_PROFILE,
  flaskRadiusAt,
  liquidHeight,
  liquidProfile,
} from '../flaskProfile';
import type { Placement, PointerState, SceneItem, SceneModel } from '../sceneModel';
import { AuthoredFlaskBody } from './AuthoredFlaskBody';

/**
 * Procedural 3D apparatus. Geometry is created once per module and shared; visual state comes only
 * from the scene model. Glass uses physical transmission and studio reflections.
 */

const lathe = (pts: readonly (readonly [number, number])[], segments = 48) =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

const GEOMETRY = {
  flask: lathe(FLASK_PROFILE),
  funnel: lathe([
    [0.04, 0],
    [0.045, 0.34],
    [0.07, 0.38],
    [0.34, 0.62],
    [0.36, 0.64],
  ]),
  beaker: lathe([
    [0, 0],
    [0.29, 0],
    [0.31, 0.02],
    [0.31, 0.6],
    [0.335, 0.63],
  ]),
  washBottle: lathe([
    [0, 0],
    [0.26, 0],
    [0.28, 0.04],
    [0.28, 0.66],
    [0.2, 0.8],
    [0.08, 0.84],
    [0.08, 0.9],
  ]),
  balanceBase: new RoundedBoxGeometry(1.95, 0.2, 0.95, 4, 0.06),
  balanceHousing: new RoundedBoxGeometry(1.3, 0.46, 0.22, 3, 0.04),
};

const GLASS_COLOR = '#f3fbff';
const SELECTED_COLOR = '#68c9f3';

function Glass({ selected, opacity = 0.36 }: { selected: boolean; opacity?: number }) {
  return (
    <meshPhysicalMaterial
      color={GLASS_COLOR}
      emissive={selected ? '#23659a' : '#000000'}
      emissiveIntensity={selected ? 0.06 : 0}
      roughness={0.035}
      metalness={0}
      clearcoat={1}
      clearcoatRoughness={0.04}
      envMapIntensity={1.35}
      transmission={0.94}
      thickness={opacity * 0.12}
      ior={1.47}
      attenuationColor="#dcefff"
      attenuationDistance={2}
      side={DoubleSide}
      depthWrite={false}
    />
  );
}

/** A single refractive shell; opaque back-face outlines previously made glass look like gray plastic. */
function GlassBody({
  geometry,
  selected,
  opacity = 0.36,
}: {
  geometry: BufferGeometry;
  selected: boolean;
  opacity?: number;
}) {
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <Glass selected={selected} opacity={opacity} />
    </mesh>
  );
}

function Liquid() {
  return (
    <meshPhysicalMaterial
      color="#bfe2f1"
      roughness={0.1}
      transparent
      opacity={0.62}
      envMapIntensity={0.8}
      depthWrite={false}
    />
  );
}

function Solid() {
  return <meshStandardMaterial color="#ffffff" roughness={0.9} />;
}

function Smudge({ y, radius }: { y: number; radius: number }) {
  return (
    <mesh
      position={[radius * 0.55, y, radius * 0.75]}
      rotation={[0, 0.6, -0.3]}
      scale={[0.55, 1, 1]}
      renderOrder={3}
    >
      <circleGeometry args={[radius * 0.28, 16]} />
      <meshBasicMaterial
        color="#6e7c86"
        transparent
        opacity={0.15}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

/** Canvas-texture label showing the label text the engine recorded. */
function useTextTexture(lines: string[], width: number, height: number, background: string) {
  const key = lines.join('\n');
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#13212b';
      ctx.textAlign = 'center';
      const size = Math.floor(height / (key.split('\n').length + 1.2));
      ctx.font = `600 ${size}px 'Noto Sans Sinhala', 'Segoe UI', system-ui, sans-serif`;
      key.split('\n').forEach((line, i) => ctx.fillText(line, width / 2, size * (i + 1.15)));
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [key, width, height, background]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function FlaskLabel({ lines }: { lines: string[] }) {
  const texture = useTextTexture(lines, 256, 128, '#fffdf5');
  const r = flaskRadiusAt(0.34) + 0.004;
  return (
    <mesh position={[0, 0.34, 0]} renderOrder={4}>
      <cylinderGeometry args={[r, r, 0.26, 32, 1, true, -0.62, 1.24]} />
      <meshStandardMaterial map={texture} side={DoubleSide} roughness={0.8} />
    </mesh>
  );
}

export function Flask3D({
  item,
  model,
  labelLines,
}: {
  item: SceneItem;
  model: SceneModel;
  labelLines: string[];
}) {
  const working = model.workingFlaskId === item.id;
  const h = liquidHeight(working ? model.liquidLevel : 0);
  const liquid = useMemo(() => (h > 0 ? lathe(liquidProfile(h)) : null), [h]);
  useEffect(() => () => liquid?.dispose(), [liquid]);
  const markR = flaskRadiusAt(FLASK_MARK_Y) + 0.003;
  const top = FLASK_PROFILE.at(-1)![1];
  return (
    <group scale={item.scale}>
      {liquid && (
        <mesh geometry={liquid} renderOrder={1}>
          <Liquid />
        </mesh>
      )}
      {working && model.undissolvedVisible && (
        <group position={[0, 0.03, 0]}>
          <mesh scale={[1, 0.22, 1]}>
            <sphereGeometry args={[0.2, 16, 8]} />
            <Solid />
          </mesh>
          {[-0.12, 0.06, 0.15].map((x, i) => (
            <mesh key={i} position={[x, 0.03, (i - 1) * 0.08]} rotation={[i, i * 0.7, 0]}>
              <icosahedronGeometry args={[0.035]} />
              <Solid />
            </mesh>
          ))}
        </group>
      )}
      <AuthoredFlaskBody
        fallback={<GlassBody geometry={GEOMETRY.flask} selected={item.highlighted} />}
      />
      <mesh position={[0, FLASK_MARK_Y, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <torusGeometry args={[markR, 0.0045, 6, 40]} />
        <meshBasicMaterial color="#1f2d36" />
      </mesh>
      {item.cleanliness === 'dirty' && <Smudge y={0.3} radius={0.5} />}
      {working && labelLines.length > 0 && <FlaskLabel lines={labelLines} />}
      {working && model.stoppered && (
        <mesh position={[0, top + 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.09, 0.16, 20]} />
          <meshStandardMaterial color="#3b4650" roughness={0.6} />
        </mesh>
      )}
      {working && model.warning && (
        <mesh position={[0.62, 1.55, 0]}>
          <octahedronGeometry args={[0.1]} />
          <meshStandardMaterial color="#e09f3e" emissive="#995605" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}

export function WatchGlass3D({ item, hasSolid }: { item: SceneItem; hasSolid: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} renderOrder={2}>
        <sphereGeometry args={[0.62, 40, 8, 0, Math.PI * 2, Math.PI - 0.62, 0.62]} />
        <Glass selected={item.highlighted} opacity={0.38} />
      </mesh>
      {hasSolid && (
        <mesh position={[0, 0.075, 0]} castShadow>
          <coneGeometry args={[0.19, 0.13, 24]} />
          <Solid />
        </mesh>
      )}
      {item.cleanliness === 'dirty' && <Smudge y={0.06} radius={0.3} />}
    </group>
  );
}

export function Funnel3D({ item, placement }: { item: SceneItem; placement: Placement }) {
  const standing = placement !== 'on_flask';
  return (
    <group>
      {standing && (
        <group>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.26, 0.04, 24]} />
            <meshStandardMaterial color="#6f7d86" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0.2, 0.3, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.56, 8]} />
            <meshStandardMaterial color="#9aa5ad" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.012, 6, 32]} />
            <meshStandardMaterial color="#9aa5ad" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}
      <group position={[0, standing ? 0.06 : 0, 0]}>
        <GlassBody geometry={GEOMETRY.funnel} selected={item.highlighted} opacity={0.4} />
      </group>
      {item.cleanliness === 'dirty' && <Smudge y={0.5} radius={0.3} />}
    </group>
  );
}

export function Beaker3D({ item }: { item: SceneItem }) {
  return (
    <group>
      <GlassBody geometry={GEOMETRY.beaker} selected={item.highlighted} />
      {[0.16, 0.28, 0.4, 0.52].map((y) => (
        <mesh key={y} position={[0.21, y, 0.23]} rotation={[0, 0.74, 0]}>
          <boxGeometry args={[0.1, 0.008, 0.004]} />
          <meshBasicMaterial color="#2f414d" />
        </mesh>
      ))}
      {item.cleanliness === 'dirty' && <Smudge y={0.3} radius={0.33} />}
    </group>
  );
}

const TUBE = new CatmullRomCurve3([
  new Vector3(0, 0.9, 0),
  new Vector3(0, 1.08, 0),
  new Vector3(0.12, 1.12, 0),
  new Vector3(0.36, 1.02, 0),
  new Vector3(0.42, 0.92, 0),
]);

export function WashBottle3D({ item }: { item: SceneItem }) {
  return (
    <group>
      <mesh geometry={GEOMETRY.washBottle} castShadow>
        <meshStandardMaterial
          color={item.highlighted ? SELECTED_COLOR : '#f3f7f9'}
          emissive={item.highlighted ? '#0f9d8a' : '#000000'}
          emissiveIntensity={item.highlighted ? 0.3 : 0}
          roughness={0.55}
          transparent
          opacity={0.88}
        />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.265, 0.265, 0.5, 32]} />
        <meshStandardMaterial color="#cfe8f4" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 20]} />
        <meshStandardMaterial color="#2f6f8f" roughness={0.5} />
      </mesh>
      <mesh>
        <tubeGeometry args={[TUBE, 24, 0.018, 8, false]} />
        <meshStandardMaterial color="#9fb3bd" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Dropper3D({ item, placement }: { item: SceneItem; placement: Placement }) {
  const standing = placement === 'shelf';
  return (
    <group
      rotation={standing ? [0, 0, 0] : [0, 0.5, Math.PI / 2]}
      position={standing ? [0, 0, 0] : [0, 0.05, 0]}
    >
      <mesh position={[0, 0.26, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.028, 0.028, 0.44, 12]} />
        <Glass selected={item.highlighted} opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.02, 0]} renderOrder={2}>
        <coneGeometry args={[0.028, 0.06, 12]} />
        <Glass selected={item.highlighted} opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.54, 0]} scale={[1, 1.4, 1]} castShadow>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshStandardMaterial color="#3b4650" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function Reagent3D({ item, formula }: { item: SceneItem; formula: string | null }) {
  const texture = useTextTexture(formula ? [formula] : [], 256, 128, '#ffffff');
  return (
    <group>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.68, 32]} />
        <meshStandardMaterial
          color={item.highlighted ? SELECTED_COLOR : '#f2efe8'}
          emissive={item.highlighted ? '#0f9d8a' : '#000000'}
          emissiveIntensity={item.highlighted ? 0.3 : 0}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.74, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.12, 32]} />
        <meshStandardMaterial color="#2f5d7c" roughness={0.45} />
      </mesh>
      {formula && (
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.262, 0.262, 0.28, 32, 1, true, -0.8, 1.6]} />
          <meshStandardMaterial map={texture} roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}

const NEEDLE_ANGLE: Record<PointerState, number> = { below: -0.28, at: 0, above: 0.28 };

export function Balance3D({ item, pointer }: { item: SceneItem; pointer: PointerState | null }) {
  const metal = <meshStandardMaterial color="#c9d1d6" metalness={0.65} roughness={0.32} />;
  return (
    <group>
      <mesh geometry={GEOMETRY.balanceBase} position={[0, 0.1, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          color={item.highlighted ? '#2f8f82' : '#3f4a52'}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      <mesh geometry={GEOMETRY.balanceHousing} position={[0.3, 0.43, 0.32]} castShadow>
        {metal}
      </mesh>
      {[0.3, 0.38, 0.46, 0.54].map((y) => (
        <group key={y}>
          <mesh position={[0.32, y, 0.45]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.014, 0.014, 1.15, 8]} />
            <meshStandardMaterial color="#5b6670" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[-0.2, y + 0.02, 0.45]}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshStandardMaterial color="#c2862f" metalness={0.4} roughness={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.55, 0.38, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.5, 12]} />
        {metal}
      </mesh>
      <mesh position={[-0.55, 0.625, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.42, 0.03, 40]} />
        {metal}
      </mesh>
      <mesh position={[0.99, 0.44, 0.42]}>
        <boxGeometry args={[0.1, 0.34, 0.02]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0.99, 0.44, 0.432]}>
        <boxGeometry args={[0.1, 0.008, 0.004]} />
        <meshBasicMaterial color="#13212b" />
      </mesh>
      <group position={[0.9, 0.44, 0.44]} rotation={[0, 0, pointer ? NEEDLE_ANGLE[pointer] : 0]}>
        <mesh position={[0.08, 0, 0]}>
          <boxGeometry args={[0.18, 0.012, 0.01]} />
          <meshBasicMaterial color={pointer ? '#13212b' : '#9aa9b3'} />
        </mesh>
      </group>
    </group>
  );
}
