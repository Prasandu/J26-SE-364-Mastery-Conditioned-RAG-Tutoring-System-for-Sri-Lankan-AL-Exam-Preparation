import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import { PMREMGenerator } from 'three';
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

function Room({ onBench }: { onBench: () => void }) {
  return (
    <group>
      <mesh position={[0, 2.4, -3.05]} receiveShadow>
        <planeGeometry args={[22, 7]} />
        <meshStandardMaterial color="#e3ecf1" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.85, -3.03]}>
        <planeGeometry args={[22, 1.7]} />
        <meshStandardMaterial color="#d7e3ea" roughness={0.8} />
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
      <color attach="background" args={['#e9f1f5']} />
      <Environment />
      <CameraRig initial={OVERVIEW_POSE} reducedMotion={reducedMotion} onReady={onCameraReady} />
      <hemisphereLight args={['#ffffff', '#8a9aa5', 0.55]} />
      <directionalLight
        castShadow
        position={[3.5, 7, 5]}
        intensity={1.35}
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
          <group key={item.id} name={item.id} position={[x, y + lift, z]}>
            <Pickable item={item} onPick={onPick}>
              {(placement === 'bench' || placement === 'shelf') && <Highlight item={item} />}
              <ItemMesh item={item} model={model} placement={placement} labelLines={labelLines} />
            </Pickable>
          </group>
        );
      })}
    </Canvas>
  );
}
