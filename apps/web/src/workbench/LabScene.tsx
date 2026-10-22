import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MovableBenchGroup } from './MovableBenchGroup';
import { ACESFilmicToneMapping, Group, PMREMGenerator, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
import { OVERVIEW_POSE, itemPosition3D } from './scene3d/layout3d';
import { LaboratoryRoom } from './scene3d/LaboratoryRoom';

/**
 * 3D laboratory: procedural fallback with an optional authored flask shell, no experiment rules. Picking an
 * item calls `onPick`, the same handler the accessible equipment list and the 2D renderer use.
 */

const SELECTION = '#26a9e8';
const HELD_LIFT = 0.45;
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
  const environment = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    return target;
  }, [gl]);
  useEffect(() => () => environment.dispose(), [environment]);
  return <primitive attach="environment" object={environment.texture} />;
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

function SetupAnchor({
  model,
  id,
  onAnchor,
}: {
  model: SceneModel;
  id: string | null;
  onAnchor: NonNullable<LabRendererProps['onSetupAnchor']>;
}) {
  const camera = useThree((s) => s.camera);
  const previous = useRef<readonly [number, number] | null>(null);
  useFrame(() => {
    const item = model.items.find((i) => i.id === id);
    if (!item) return;
    const [x, y, z] = itemPosition3D(item, model);
    const p = new Vector3(x + 0.3, y + 1.6, z).project(camera);
    const next = [(p.x + 1) / 2, (1 - p.y) / 2] as const;
    if (
      !previous.current ||
      Math.abs(next[0] - previous.current[0]) + Math.abs(next[1] - previous.current[1]) > 0.002
    ) {
      previous.current = next;
      onAnchor(next);
    }
  });
  return null;
}

export default function LabScene({
  model,
  onPick,
  label,
  heldItemId = null,
  labelLines,
  reducedMotion,
  onCameraReady,
  setupTargetId = null,
  onSetupAnchor,
  arrange = false,
  onArrange,
}: LabSceneProps) {
  const [moving, setMoving] = useState(false);
  return (
    <Canvas
      frameloop="demand"
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      scene={{ environmentIntensity: 0.45 }}
      camera={{ position: OVERVIEW_POSE.position, fov: 40, near: 0.1, far: 60 }}
      aria-label={label}
      role="img"
      dpr={[1, 1.75]}
      shadows="percentage"
    >
      {/* Pale glass needs something to read against. The backdrop was near-white (#e9f1f5), which
          is why the apparatus looked washed out; a deeper slate keeps the room bright without
          letting the glassware disappear into it. */}
      <color attach="background" args={['#bdcbd5']} />
      <Environment />
      {onSetupAnchor && <SetupAnchor model={model} id={setupTargetId} onAnchor={onSetupAnchor} />}
      <CameraRig
        initial={OVERVIEW_POSE}
        reducedMotion={reducedMotion}
        onReady={onCameraReady}
        enabled={!moving}
      />
      <hemisphereLight args={['#f2f7ff', '#3c5369', 0.4]} />
      <directionalLight
        castShadow
        position={[3.5, 7, 5]}
        intensity={1.8}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 4, 2]} intensity={0.35} color="#c9dfff" />
      <directionalLight position={[1, 5, -4]} intensity={0.8} color="#f3f8ff" />
      <LaboratoryRoom onBench={() => onPick(BENCH_TARGET)} />
      {model.items.map((item) => {
        const placement = placementOf(item, model);
        const [x, y, z] = itemPosition3D(item, model);
        // A picked-up item is drawn lifted above its place until the engine moves it.
        const lift = heldItemId === item.id ? HELD_LIFT : 0;
        const content = (
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
        return arrange && placement === 'bench' && onArrange ? (
          <MovableBenchGroup
            key={item.id}
            id={item.id}
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
            offset={model.positionOffsets?.[item.id] ?? { x: 0, z: 0 }}
            onMove={onArrange}
            onSelect={onPick}
            onDragging={setMoving}
          >
            {content}
          </MovableBenchGroup>
        ) : (
          content
        );
      })}
    </Canvas>
  );
}
