import { Canvas } from '@react-three/fiber';
import { Component, useMemo, useState, type ReactNode } from 'react';
import { CatmullRomCurve3, DoubleSide, LatheGeometry, Vector2, Vector3 } from 'three';
import { useTranslation } from 'react-i18next';
import { ApparatusKindSchema, type TeachingApparatusKind } from '@vlab/contracts';
import { TeachingCamera, TeachingStudio, TeachingTool3D } from '../teaching/TeachingScene3D';
import { Balance3D, WatchGlass3D, Funnel3D } from '../scene3d/Apparatus3D';
import { FLASK_PROFILE } from '../flaskProfile';
import type { SceneItem } from '../sceneModel';
import { InstrumentSetupAnchor } from '../InstrumentSetupAnchor';
import { MovableBenchGroup } from '../MovableBenchGroup';
import type { BenchOffset, BenchOffsets } from '../benchLayout';
import type { HandbookResult, HandbookRun } from '../../engine/localAdapter';
import type { HandbookInstrument } from './apparatus';

export interface HandbookScene3DProps {
  nodes: HandbookInstrument[];
  run: HandbookRun;
  result: HandbookResult | null;
  selected: string;
  offsets: BenchOffsets;
  onMove: (id: string, p: BenchOffset) => void;
  onSelect: (id: string) => void;
  zoom: number;
  reset: number;
  active: boolean;
  fallback: ReactNode;
  setupTarget: string;
  onSetupAnchor: (p: readonly [number, number]) => void;
}
function Glass() {
  return (
    <meshPhysicalMaterial
      color="#b6d7e8"
      transparent
      opacity={0.35}
      transmission={0.2}
      roughness={0.12}
      depthWrite={false}
      side={DoubleSide}
      envMapIntensity={0.5}
    />
  );
}
const SHAPES: Record<string, number[][]> = {
  linear: [
    [-1, 0, 0],
    [1, 0, 0],
  ],
  bent: [
    [-0.8, -0.5, 0],
    [0.8, -0.5, 0],
  ],
  trigonal_planar: [
    [0, 1, 0],
    [-0.86, -0.5, 0],
    [0.86, -0.5, 0],
  ],
  tetrahedral: [
    [0.65, 0.65, 0.65],
    [-0.65, -0.65, 0.65],
    [-0.65, 0.65, -0.65],
    [0.65, -0.65, -0.65],
  ],
  trigonal_pyramidal: [
    [0, -0.4, 1],
    [-0.86, -0.4, -0.5],
    [0.86, -0.4, -0.5],
  ],
  seesaw: [
    [0, 1, 0],
    [0, -1, 0],
    [-0.86, 0, -0.5],
    [0.86, 0, -0.5],
  ],
  t_shaped: [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
  ],
  square_planar: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ],
  square_pyramidal: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
  ],
  octahedral: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
    [0, -1, 0],
  ],
};
function Molecule({ result }: { result: HandbookResult | null }) {
  return (
    <group position={[0, 0.9, 0]}>
      <mesh>
        <sphereGeometry args={[0.24, 28, 20]} />
        <meshStandardMaterial color="#3688c9" />
      </mesh>
      {(SHAPES[result?.shape ?? 'linear'] ?? SHAPES.linear)!
        .slice(0, result?.bonds ?? 0)
        .map((p, i) => {
          const v = new Vector3(p[0], p[1], p[2]);
          const curve = new CatmullRomCurve3([new Vector3(), v]);
          return (
            <group key={i}>
              <mesh>
                <tubeGeometry args={[curve, 2, 0.045, 10, false]} />
                <meshStandardMaterial color="#cadce7" />
              </mesh>
              <mesh position={[v.x, v.y, v.z]}>
                <sphereGeometry args={[0.17, 24, 16]} />
                <meshStandardMaterial color="#eaf3fa" />
              </mesh>
            </group>
          );
        })}
      {Array.from({ length: result?.lonePairs ?? 0 }, (_, i) => (
        <group key={i} position={[-0.3 + i * 0.22, 0.5, 0]}>
          {[-0.04, 0.04].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <meshBasicMaterial color="#efd18a" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
function Tool({
  node,
  selected,
  run,
  result,
  active,
}: {
  node: HandbookInstrument;
  selected: boolean;
  run: HandbookRun;
  result: HandbookResult | null;
  active: boolean;
}) {
  const { kind } = node,
    colour = result?.colour ?? '#b3d8e8';
  const flask = useMemo(
    () =>
      new LatheGeometry(
        FLASK_PROFILE.map(([r, y]) => new Vector2(r, y)),
        36,
      ),
    [],
  );
  const pipette = useMemo(
    () =>
      new LatheGeometry(
        [
          [0, 0],
          [0.025, 0.08],
          [0.025, 0.6],
          [0.1, 0.75],
          [0.1, 0.9],
          [0.025, 1.04],
          [0.025, 1.8],
        ].map((p) => new Vector2(p[0], p[1])),
        28,
      ),
    [],
  );
  const item: SceneItem = {
    id: node.id,
    kind: 'balance',
    nameKey: '',
    highlighted: selected,
    onBench: true,
    cleanliness: null,
    scale: 1,
  };
  if ((ApparatusKindSchema.options as readonly string[]).includes(kind))
    return (
      <TeachingTool3D
        kind={kind as TeachingApparatusKind}
        selected={selected}
        colour={colour}
        precipitate={null}
        mirror={false}
        heating={active}
        flameColour={run.number === 10 ? colour : undefined}
        sealed={run.number === 5}
        bubbles={false}
      />
    );
  if (kind === 'molecular_kit') return <Molecule result={result} />;
  if (kind === 'balance') return <Balance3D item={item} pointer={null} />;
  if (kind === 'watch_glass')
    return <WatchGlass3D item={{ ...item, kind: 'watch_glass' }} hasSolid={false} />;
  if (kind === 'funnel') return <Funnel3D item={{ ...item, kind: 'funnel' }} placement="bench" />;
  if (kind === 'volumetric_flask')
    return (
      <mesh geometry={flask} scale={0.65}>
        <Glass />
      </mesh>
    );
  if (kind === 'pipette')
    return (
      <mesh geometry={pipette}>
        <Glass />
      </mesh>
    );
  if (kind === 'burette')
    return (
      <>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 2.1, 24, 1, true]} />
          <Glass />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.7, 20]} />
          <meshStandardMaterial color={colour} transparent opacity={0.55} depthWrite={false} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[0.04, 0.3 + i * 0.14, 0.065]}>
            <boxGeometry args={[0.06, 0.008, 0.006]} />
            <meshBasicMaterial color="#3e637b" />
          </mesh>
        ))}
        <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.3, 16]} />
          <meshStandardMaterial color="#315c79" />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.025, 0.012, 0.27, 16]} />
          <Glass />
        </mesh>
      </>
    );
  if (kind === 'thermometer' || kind === 'barometer')
    return (
      <>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry
            args={[kind === 'barometer' ? 0.1 : 0.045, kind === 'barometer' ? 0.1 : 0.045, 1.8, 20]}
          />
          <Glass />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.2, 12]} />
          <meshBasicMaterial color={kind === 'thermometer' ? '#c96b62' : '#7a95ad'} />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.07, 20, 12]} />
          <meshStandardMaterial color="#c96b62" />
        </mesh>
      </>
    );
  if (kind === 'calorimeter')
    return (
      <>
        <mesh position={[0, 0.44, 0]}>
          <cylinderGeometry args={[0.6, 0.49, 0.88, 36, 1, true]} />
          <meshStandardMaterial color="#d5e0e7" side={DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.89, 0]}>
          <torusGeometry args={[0.32, 0.23, 12, 36]} />
          <meshStandardMaterial color="#cad5dd" />
        </mesh>
      </>
    );
  if (kind === 'top_balance')
    return (
      <>
        <mesh position={[0, 0.17, 0]}>
          <boxGeometry args={[1.25, 0.34, 0.85]} />
          <meshStandardMaterial color="#264e6b" />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.48, 0.48, 0.08, 32]} />
          <meshStandardMaterial color="#bdcdd7" metalness={0.4} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.18, 0.431]}>
          <planeGeometry args={[0.48, 0.15]} />
          <meshBasicMaterial color="#cde7dd" />
        </mesh>
      </>
    );
  if (kind === 'crucible')
    return (
      <>
        <mesh position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.42, 0.3, 0.46, 32]} />
          <meshStandardMaterial color="#dfe4df" />
        </mesh>
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.46, 0.46, 0.06, 32]} />
          <meshStandardMaterial color="#eef0e8" />
        </mesh>
        <mesh position={[0, 0.56, 0]}>
          <sphereGeometry args={[0.06, 16, 10]} />
          <meshStandardMaterial color="#c2cccd" />
        </mesh>
      </>
    );
  if (kind === 'tripod')
    return (
      <>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 1.1, 0]}>
          <torusGeometry args={[0.46, 0.035, 8, 28]} />
          <meshStandardMaterial color="#5d7a8e" />
        </mesh>
        {[0, 2.1, 4.2].map((a) => (
          <mesh
            key={a}
            position={[Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4]}
            rotation={[Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15]}
          >
            <cylinderGeometry args={[0.035, 0.035, 1.1, 12]} />
            <meshStandardMaterial color="#748e9f" />
          </mesh>
        ))}
      </>
    );
  if (kind === 'wire_loop')
    return (
      <group rotation={[0, 0, -0.5]}>
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.8, 12]} />
          <meshStandardMaterial color="#a6bac7" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <torusGeometry args={[0.07, 0.014, 8, 20]} />
          <meshStandardMaterial color="#a6bac7" />
        </mesh>
      </group>
    );
  if (kind === 'measuring_cylinder')
    return (
      <>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 1.6, 24, 1, true]} />
          <Glass />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.06, 24]} />
          <Glass />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} position={[0.08, 0.2 + i * 0.13, 0.16]}>
            <boxGeometry args={[0.14, 0.008, 0.006]} />
            <meshBasicMaterial color="#42627a" />
          </mesh>
        ))}
      </>
    );
  if (kind === 'cobalt_glass')
    return (
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.55, 0.7, 0.045]} />
        <meshPhysicalMaterial color="#293e9e" transparent opacity={0.8} roughness={0.1} />
      </mesh>
    );
  if (kind === 'power_supply')
    return (
      <>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[1.1, 0.8, 0.65]} />
          <meshStandardMaterial color="#bccdd9" />
        </mesh>
        <mesh position={[-0.17, 0.5, 0.33]}>
          <planeGeometry args={[0.42, 0.2]} />
          <meshBasicMaterial color="#264e6b" />
        </mesh>
        <mesh position={[0.3, 0.22, 0.34]}>
          <sphereGeometry args={[0.09, 20, 16]} />
          <meshStandardMaterial color={active ? '#6faf80' : '#4b6d83'} />
        </mesh>
      </>
    );
  if (kind === 'cathode_tube')
    return (
      <group position={[0, 0.7, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.4, 2.5, 12, 28]} />
          <Glass />
        </mesh>
        {[-1.1, 1.1].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.07, 28]} />
            <meshStandardMaterial color="#a2b8c6" />
          </mesh>
        ))}
        {active && (
          <mesh>
            <tubeGeometry
              args={[
                new CatmullRomCurve3([
                  new Vector3(-1.1, 0, 0),
                  new Vector3(0, 0, 0),
                  new Vector3(
                    1.1,
                    run.inputs.tube === 'electric'
                      ? run.inputs.polarity === 'positive_above'
                        ? 0.23
                        : -0.23
                      : run.inputs.tube === 'magnetic'
                        ? 0.23
                        : 0,
                    0,
                  ),
                ]),
                24,
                0.02,
                10,
                false,
              ]}
            />
            <meshBasicMaterial color="#87eea0" />
          </mesh>
        )}
        {run.inputs.tube === 'cross' && (
          <group position={[0.2, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.07, 0.55, 0.07]} />
              <meshStandardMaterial color="#344b5c" />
            </mesh>
            <mesh>
              <boxGeometry args={[0.4, 0.07, 0.07]} />
              <meshStandardMaterial color="#344b5c" />
            </mesh>
          </group>
        )}
        {run.inputs.tube === 'paddle' && (
          <group>
            {[0, Math.PI / 4, Math.PI / 2, -Math.PI / 4].map((angle) => (
              <mesh key={angle} rotation={[0, 0, angle]}>
                <boxGeometry args={[0.5, 0.04, 0.09]} />
                <meshStandardMaterial color="#738c9f" />
              </mesh>
            ))}
          </group>
        )}
      </group>
    );
  return null;
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export default function HandbookScene3D({
  nodes,
  run,
  result,
  selected,
  offsets,
  onMove,
  onSelect,
  zoom,
  reset,
  active,
  fallback,
  setupTarget,
  onSetupAnchor,
}: HandbookScene3DProps) {
  const { t } = useTranslation(),
    [moving, setMoving] = useState(false);
  return (
    <Boundary fallback={fallback}>
      <Canvas
        frameloop="demand"
        camera={{ fov: 38, near: 0.1, far: 70 }}
        dpr={[1, 1.5]}
        fallback={fallback}
        aria-label={t('ui.practice.view_3d')}
        onCreated={({ gl }) => {
          gl.domElement.dataset.ready = 'true';
        }}
      >
        <color attach="background" args={['#124969']} />
        <TeachingStudio />
        <TeachingCamera zoom={zoom} reset={reset} moving={moving} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 7, 5]} intensity={1.3} />
        <directionalLight position={[-4, 3, -3]} intensity={0.7} />
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[12, 0.2, 4]} />
          <meshStandardMaterial color="#657f91" roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.5, -2]}>
          <boxGeometry args={[14, 4, 0.12]} />
          <meshStandardMaterial color="#164a6b" />
        </mesh>
        {nodes
          .filter((n) => n.id === setupTarget)
          .map((n) => (
            <InstrumentSetupAnchor
              key={n.id}
              position={[n.x, n.y + 1.7, n.z]}
              onChange={onSetupAnchor}
            />
          ))}
        {nodes.map((node) => (
          <MovableBenchGroup
            key={node.id}
            id={node.id}
            position={[node.x, node.y, node.z]}
            rotation={[0, 0, node.rotation]}
            offset={offsets[node.id] ?? { x: 0, z: 0 }}
            onMove={onMove}
            onSelect={onSelect}
            onDragging={setMoving}
          >
            {selected === node.id && (
              <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.3, 0.35, 36]} />
                <meshBasicMaterial color="#45c5f3" side={DoubleSide} />
              </mesh>
            )}
            <Tool
              node={node}
              selected={selected === node.id}
              run={run}
              result={result}
              active={active}
            />
          </MovableBenchGroup>
        ))}
      </Canvas>
    </Boundary>
  );
}
