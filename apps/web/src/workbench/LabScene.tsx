import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Group, PMREMGenerator, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BENCH_TARGET } from './interaction/gestures';
import type { LabRendererProps } from './labRenderer';
import { placementOf, type Placement, type SceneItem, type SceneModel } from './sceneModel';
import {
  Balance3D,
  Beaker3D,
  Dropper3D,
  Flask3D,
  Funnel3D,
  Reagent3D,
  WashBottle3D,
  WatchGlass3D,
} from './scene3d/Apparatus3D';
import { CameraRig, type CameraApi } from './scene3d/CameraRig';
import { OVERVIEW_POSE, RISER, itemPosition3D } from './scene3d/layout3d';

/**
 * 3D laboratory: procedural geometry only (no external assets), no experiment rules. Picking an
 * item calls `onPick`, the same handler the accessible equipment list and the 2D renderer use.
 */

const SELECTION = '#0f9d8a';
const HELD_LIFT = 0.45;
const WORKTOP = new RoundedBoxGeometry(9.8, 0.24, 5.8, 4, 0.05);
/** Pointer travel (px) above which a press is treated as an orbit drag, not a pick. */
const DRAG_TOLERANCE = 6;
/** Approximate footprint radius per kind for the selection ring. */
const FOOTPRINT: Record<SceneItem['kind'], number> = {
  volumetric_flask: 0.66,
  balance: 1.12,
  watch_glass: 0.46,
  funnel: 0.42,
  beaker: 0.42,
  wash_bottle: 0.38,
  dropper: 0.38,
  reagent: 0.36,
};

/** Soft studio reflections for glass (three's RoomEnvironment; no downloaded HDR file). */
function Environment() {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return target.texture;
  }, [gl]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="environment" object={texture} />;
}

/**
 * Matches the 2D laboratory's placement transition so both renderers move at the same speed.
 * Held in seconds because `useFrame` reports delta in seconds: converting inline would be an
 * ad-hoc unit conversion in rendering code, which the project bans.
 */
const PLACEMENT_SECONDS = 0.42;

/**
 * Eases a group to an engine-confirmed position instead of snapping to it.
 *
 * The 2D laboratory already animates placement changes (a 420ms CSS transition on the item's
 * `transform`), but the 3D apparatus were positioned directly from `itemPosition3D`, so the watch
 * glass teleported onto the balance while the same action in 2D showed it travelling. This closes
 * that gap without changing what is drawn: the target is still only ever an engine-confirmed
 * position, so a rejected action moves nothing, and the first frame places the item outright
 * rather than flying it in from the origin.
 *
 * The canvas renders on demand, so each in-flight frame has to ask for the next one.
 */
function SettledGroup({
  name,
  target,
  reducedMotion,
  children,
}: {
  name: string;
  target: [number, number, number];
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const placed = useRef(false);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => invalidate(), [target, invalidate]);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const [x, y, z] = target;
    // Reduced motion, and the very first placement, jump straight to the settled state.
    if (reducedMotion || !placed.current) {
      group.position.set(x, y, z);
      placed.current = true;
      return;
    }
    const step = 1 - Math.exp((-delta * 5) / PLACEMENT_SECONDS);
    group.position.x += (x - group.position.x) * step;
    group.position.y += (y - group.position.y) * step;
    group.position.z += (z - group.position.z) * step;
    if (group.position.distanceTo(TARGET_VEC.set(x, y, z)) > 0.001) invalidate();
    else group.position.set(x, y, z);
  });

  return (
    <group ref={ref} name={name}>
      {children}
    </group>
  );
}

/** Scratch vector reused every frame so easing allocates nothing. */
const TARGET_VEC = new Vector3();

function Room({ onBench }: { onBench: () => void }) {
  return (
    <group>
      {/* Back wall: a mid tone, not near-white, so glassware in front of it keeps a visible
          silhouette. The lower band is darker still, giving the bench a horizon to sit against. */}
      {/* Deliberately oversized: the closer overview camera used to see past the old 22x7 panel,
          leaving raw clear-colour in the upper corners where the room should be. */}
      <mesh position={[0, 5, -3.05]} receiveShadow>
        <planeGeometry args={[34, 16]} />
        <meshStandardMaterial color="#b9cdd8" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.85, -3.03]}>
        <planeGeometry args={[22, 1.7]} />
        <meshStandardMaterial color="#9db4c2" roughness={0.8} />
      </mesh>
      <mesh position={[4.9, 3.4, -3.02]}>
        <planeGeometry args={[2.4, 2.2]} />
        <meshBasicMaterial color="#d8edf7" />
      </mesh>
      <mesh position={[4.9, 3.4, -3.01]}>
        <boxGeometry args={[0.06, 2.2, 0.02]} />
        <meshStandardMaterial color="#b7c6cf" />
      </mesh>
      <mesh
        geometry={WORKTOP}
        position={[0, -0.12, 0]}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta <= DRAG_TOLERANCE) onBench();
        }}
      >
        <meshStandardMaterial color="#55636d" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, -1.3, 0.2]}>
        <boxGeometry args={[9.6, 2.1, 5.4]} />
        <meshStandardMaterial color="#46535c" roughness={0.8} />
      </mesh>
      {[-3.6, -1.2, 1.2, 3.6].map((x) => (
        <mesh key={x} position={[x, -0.75, 2.92]}>
          <boxGeometry args={[2.2, 0.06, 0.02]} />
          <meshStandardMaterial color="#7d8b95" metalness={0.4} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[RISER.x, RISER.height / 2, RISER.z]} castShadow receiveShadow>
        <boxGeometry args={[RISER.width, RISER.height, RISER.depth]} />
        <meshStandardMaterial color="#a3b0b8" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Highlight({ item }: { item: SceneItem }) {
  if (!item.highlighted && !item.onBench) return null;
  const r = FOOTPRINT[item.kind] * (item.kind === 'volumetric_flask' ? item.scale : 1);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={item.highlighted ? [r, r + 0.1, 48] : [r + 0.02, r + 0.05, 48]} />
        <meshBasicMaterial
          color={item.highlighted ? SELECTION : '#1f6f8b'}
          transparent
          opacity={item.highlighted ? 0.95 : 0.4}
        />
      </mesh>
      {item.highlighted && (
        <mesh
          position={[0, item.kind === 'volumetric_flask' ? 2.55 * item.scale : 1.3, 0]}
          rotation={[Math.PI, 0, 0]}
        >
          <coneGeometry args={[0.1, 0.22, 4]} />
          <meshStandardMaterial color={SELECTION} emissive={SELECTION} emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}

function ItemMesh({
  item,
  model,
  placement,
  labelLines,
}: {
  item: SceneItem;
  model: SceneModel;
  placement: Placement;
  labelLines: string[];
}) {
  switch (item.kind) {
    case 'volumetric_flask':
      return <Flask3D item={item} model={model} labelLines={labelLines} />;
    case 'balance':
      return <Balance3D item={item} pointer={model.balance.pointer} />;
    case 'watch_glass':
      return <WatchGlass3D item={item} hasSolid={model.watchGlassHasSolid} />;
    case 'funnel':
      return <Funnel3D item={item} placement={placement} />;
    case 'beaker':
      return <Beaker3D item={item} />;
    case 'wash_bottle':
      return <WashBottle3D item={item} />;
    case 'dropper':
      return <Dropper3D item={item} placement={placement} />;
    case 'reagent':
      return <Reagent3D item={item} formula={model.reagentFormula} />;
  }
}

function Pickable({
  item,
  onPick,
  children,
}: {
  item: SceneItem;
  onPick: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta <= DRAG_TOLERANCE) onPick(item.id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {children}
    </group>
  );
}

export interface LabSceneProps extends LabRendererProps {
  labelLines: string[];
  reducedMotion: boolean;
  onCameraReady: (api: CameraApi) => void;
}

export default function LabScene({
  model,
  onPick,
  label,
  heldItemId = null,
  labelLines,
  reducedMotion,
  onCameraReady,
}: LabSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: OVERVIEW_POSE.position, fov: 40, near: 0.1, far: 60 }}
      aria-label={label}
      role="img"
      dpr={[1, 1.75]}
      shadows="percentage"
    >
      {/* Pale glass needs something to read against. The backdrop was near-white (#e9f1f5), which
          is why the apparatus looked washed out; a deeper slate keeps the room bright without
          letting the glassware disappear into it. */}
      <color attach="background" args={['#aec4d0']} />
      <Environment />
      <CameraRig initial={OVERVIEW_POSE} reducedMotion={reducedMotion} onReady={onCameraReady} />
      <hemisphereLight args={['#ffffff', '#76889a', 0.5]} />
      <directionalLight
        castShadow
        position={[3.5, 7, 5]}
        intensity={1.5}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 4, 2]} intensity={0.35} />
      <Room onBench={() => onPick(BENCH_TARGET)} />
      {model.items.map((item) => {
        const placement = placementOf(item, model);
        const [x, y, z] = itemPosition3D(item, model);
        // A picked-up item is drawn lifted above its place until the engine moves it.
        const lift = heldItemId === item.id ? HELD_LIFT : 0;
        return (
          <SettledGroup
            key={item.id}
            name={item.id}
            target={[x, y + lift, z]}
            reducedMotion={reducedMotion}
          >
            <Pickable item={item} onPick={onPick}>
              {(placement === 'bench' || placement === 'shelf') && <Highlight item={item} />}
              <ItemMesh item={item} model={model} placement={placement} labelLines={labelLines} />
            </Pickable>
          </SettledGroup>
        );
      })}
    </Canvas>
  );
}
