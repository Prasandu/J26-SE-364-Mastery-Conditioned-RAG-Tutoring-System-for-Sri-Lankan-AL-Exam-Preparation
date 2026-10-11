import { Canvas, type ThreeEvent } from '@react-three/fiber';
import type { ReactNode } from 'react';
import type { SceneItem, SceneModel } from './sceneModel';

/**
 * Visual interaction layer only: simple programmatic geometry, no external assets, no rules.
 * Picking an item calls `onPick`, the same handler the accessible equipment list uses.
 */

const COLORS = {
  glass: '#cfe8ef',
  glassHighlight: '#2a9d8f',
  metal: '#8a939b',
  solid: '#ffffff',
  liquid: '#7fb7d6',
  warning: '#e09f3e',
  bench: '#d9d4c7',
  label: '#fffdf5',
  stopper: '#4a4a4a',
  bottle: '#e8f1f2',
  selection: '#0f9d8a',
  onBench: '#1f6f8b',
  benchEdge: '#bfb8a6',
};

const POSITIONS: Record<string, [number, number, number]> = {
  four_beam_balance: [-3, 0, 0],
  watch_glass: [-3, 0.62, 0],
  reagent_na2co3: [-1.6, 0, -1],
  volumetric_flask_250: [0, 0, 0],
  volumetric_flask_100: [1.4, 0, -1.4],
  volumetric_flask_500: [2.6, 0, -1.4],
  funnel: [1.4, 0, 0.8],
  wash_bottle: [2.6, 0, 0.6],
  beaker: [-1.4, 0, 1.2],
  dropper_or_glass_tube: [0.9, 0, 1.6],
};

function Pickable({
  item,
  onPick,
  position,
  children,
}: {
  item: SceneItem;
  onPick: (id: string) => void;
  position: [number, number, number];
  children: ReactNode;
}) {
  return (
    <group
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onPick(item.id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <SelectionRing item={item} />
      {children}
    </group>
  );
}

/**
 * Presentation-only state cue on the bench surface: a teal ring for the item the learner has
 * selected or focused, a faint ring for apparatus the engine has accepted onto the bench.
 */
function SelectionRing({ item }: { item: SceneItem }) {
  if (!item.highlighted && !item.onBench) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      <ringGeometry args={item.highlighted ? [0.62, 0.74, 40] : [0.64, 0.68, 40]} />
      <meshBasicMaterial
        color={item.highlighted ? COLORS.selection : COLORS.onBench}
        transparent
        opacity={item.highlighted ? 0.95 : 0.55}
      />
    </mesh>
  );
}

const glassMaterial = (item: SceneItem) => (
  <meshStandardMaterial
    color={item.highlighted ? COLORS.glassHighlight : COLORS.glass}
    transparent
    opacity={item.onBench ? 0.55 : 0.3}
  />
);

function Flask({ item, model }: { item: SceneItem; model: SceneModel }) {
  const isWorking = model.workingFlaskId === item.id;
  const scale = item.id.endsWith('100') ? 0.75 : item.id.endsWith('500') ? 1.2 : 1;
  const level = isWorking ? model.liquidLevel : 0;
  return (
    <group scale={scale}>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 24, 16]} />
        {glassMaterial(item)}
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1, 16]} />
        {glassMaterial(item)}
      </mesh>
      {level > 0 && (
        <mesh
          position={[0, 0.05 + 0.45 * Math.min(level, 1), 0]}
          scale={[0.92, Math.min(level, 1), 0.92]}
        >
          <sphereGeometry args={[0.48, 20, 12]} />
          <meshStandardMaterial color={COLORS.liquid} transparent opacity={0.7} />
        </mesh>
      )}
      {isWorking && model.undissolvedVisible && (
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.05, 16]} />
          <meshStandardMaterial color={COLORS.solid} />
        </mesh>
      )}
      {isWorking && model.stoppered && (
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.12, 0.09, 0.15, 12]} />
          <meshStandardMaterial color={COLORS.stopper} />
        </mesh>
      )}
      {isWorking && model.labelAttached && (
        <mesh position={[0, 0.5, 0.49]}>
          <boxGeometry args={[0.4, 0.22, 0.02]} />
          <meshStandardMaterial color={COLORS.label} />
        </mesh>
      )}
      {isWorking && model.warning && (
        <mesh position={[0.6, 1.6, 0]}>
          <octahedronGeometry args={[0.14]} />
          <meshStandardMaterial color={COLORS.warning} />
        </mesh>
      )}
    </group>
  );
}

function ItemMesh({ item, model }: { item: SceneItem; model: SceneModel }) {
  switch (item.kind) {
    case 'volumetric_flask':
      return <Flask item={item} model={model} />;
    case 'balance':
      return (
        <group>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[1.6, 0.4, 0.8]} />
            <meshStandardMaterial color={item.highlighted ? COLORS.glassHighlight : COLORS.metal} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.45, 0.45, 0.05, 24]} />
            <meshStandardMaterial color={COLORS.metal} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0.1, 0.12 + i * 0.07, 0.42]}>
              <boxGeometry args={[1.2, 0.03, 0.03]} />
              <meshStandardMaterial color="#5b6670" />
            </mesh>
          ))}
        </group>
      );
    case 'watch_glass':
      return (
        <group position={model.watchGlassOnBalance ? [0, 0, 0] : [0.8, -0.6, 1]}>
          <mesh scale={[1, 0.18, 1]}>
            <sphereGeometry args={[0.38, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            {glassMaterial(item)}
          </mesh>
          {model.watchGlassHasSolid && (
            <mesh position={[0, 0.02, 0]}>
              <coneGeometry args={[0.16, 0.12, 16]} />
              <meshStandardMaterial color={COLORS.solid} />
            </mesh>
          )}
        </group>
      );
    case 'funnel':
      return (
        <group position={model.funnelOnFlask ? [-1.4, 1.75, -0.8] : [0, 0, 0]}>
          <mesh position={[0, 0.45, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.32, 0.45, 20, 1, true]} />
            {glassMaterial(item)}
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.3, 10]} />
            {glassMaterial(item)}
          </mesh>
        </group>
      );
    case 'wash_bottle':
      return (
        <group>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.8, 20]} />
            <meshStandardMaterial
              color={item.highlighted ? COLORS.glassHighlight : COLORS.bottle}
            />
          </mesh>
          <mesh position={[0.15, 0.95, 0]} rotation={[0, 0, -0.6]}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <meshStandardMaterial color={COLORS.metal} />
          </mesh>
        </group>
      );
    case 'beaker':
      return (
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.32, 0.3, 0.6, 20, 1, true]} />
          {glassMaterial(item)}
        </mesh>
      );
    case 'dropper':
      return (
        <group rotation={[0, 0, Math.PI / 2.4]} position={[0, 0.06, 0]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.02, 0.6, 8]} />
            {glassMaterial(item)}
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color={COLORS.stopper} />
          </mesh>
        </group>
      );
    case 'reagent':
      return (
        <group>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.6, 20]} />
            <meshStandardMaterial color={item.highlighted ? COLORS.glassHighlight : '#f4f1ea'} />
          </mesh>
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 20]} />
            <meshStandardMaterial color={COLORS.stopper} />
          </mesh>
        </group>
      );
  }
}

export default function LabScene({
  model,
  onPick,
  label,
}: {
  model: SceneModel;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 4.2, 6.8], fov: 42 }}
      aria-label={label}
      role="img"
      onCreated={({ camera }) => camera.lookAt(0, 0.4, 0)}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#eef5f7']} />
      <hemisphereLight args={['#ffffff', '#c9d6dc', 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 7, 5]} intensity={1.05} />
      <directionalLight position={[-5, 3, -2]} intensity={0.35} />
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[9.4, 0.3, 5.4]} />
        <meshStandardMaterial color={COLORS.benchEdge} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <planeGeometry args={[9.2, 5.2]} />
        <meshStandardMaterial color={COLORS.bench} roughness={0.85} />
      </mesh>
      {model.items.map((item) => (
        <Pickable
          key={item.id}
          item={item}
          onPick={onPick}
          position={POSITIONS[item.id] ?? [0, 0, 2]}
        >
          <ItemMesh item={item} model={model} />
        </Pickable>
      ))}
    </Canvas>
  );
}
