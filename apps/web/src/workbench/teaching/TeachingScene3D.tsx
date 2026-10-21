import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Component, useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CatmullRomCurve3,
  DoubleSide,
  LatheGeometry,
  PMREMGenerator,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { TeachingApparatusKind } from '@vlab/contracts';
import { TEACHING_COLOURS, teachingPlacement, type TeachingSceneProps } from './TeachingScene';

const lathe = (profile: readonly (readonly [number, number])[]) =>
  new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    36,
  );
const TUBE = lathe([
  [0, 0],
  [0.08, 0.02],
  [0.16, 0.08],
  [0.18, 0.18],
  [0.18, 1.3],
  [0.16, 1.3],
  [0.16, 0.18],
  [0.11, 0.08],
  [0, 0.06],
]);
const BEAKER = lathe([
  [0, 0],
  [0.57, 0],
  [0.6, 0.05],
  [0.6, 0.75],
  [0.56, 0.75],
  [0.56, 0.07],
  [0, 0.07],
]);
const FLASK = lathe([
  [0, 0],
  [0.47, 0],
  [0.5, 0.05],
  [0.15, 0.9],
  [0.15, 1.2],
  [0.12, 1.2],
  [0.12, 0.9],
  [0.46, 0.08],
  [0, 0.08],
]);
const PIPE = new CatmullRomCurve3(
  [
    new Vector3(-1.7, 1.05, 0),
    new Vector3(-1, 1.05, 0),
    new Vector3(-1, 1.9, 0),
    new Vector3(2.2, 1.9, 0),
    new Vector3(2.2, 0.48, 0),
  ],
  false,
  'centripetal',
  0.05,
);

function Studio() {
  const { gl } = useThree();
  const target = useMemo(() => {
    const generator = new PMREMGenerator(gl),
      room = new RoomEnvironment();
    const result = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    return result;
  }, [gl]);
  useEffect(() => () => target.dispose(), [target]);
  return <primitive attach="environment" object={target.texture} />;
}
function Camera({ zoom, reset }: { zoom: number; reset: number }) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    const distance = Math.max(9, 13 / Math.max(0.4, size.width / size.height)) / zoom;
    camera.position.set(0, distance * 0.5, distance);
    controls.target.set(0, 0.8, 0);
    Object.assign(controls, {
      enablePan: false,
      enableDamping: false,
      minDistance: 5,
      maxDistance: 24,
      minPolarAngle: 0.4,
      maxPolarAngle: 1.4,
    });
    controls.update();
    invalidate();
  }, [camera, controls, invalidate, size.width, size.height, zoom, reset]);
  useEffect(() => {
    const changed = () => invalidate();
    controls.addEventListener('change', changed);
    return () => {
      controls.removeEventListener('change', changed);
      controls.dispose();
    };
  }, [controls, invalidate]);
  return null;
}
function Glass({ selected }: { selected: boolean }) {
  return (
    <meshPhysicalMaterial
      color="#acd2e5"
      roughness={0.12}
      metalness={0}
      transmission={0.3}
      thickness={0.06}
      transparent
      opacity={0.42}
      envMapIntensity={0.55}
      side={DoubleSide}
      depthWrite={false}
      emissive={selected ? '#236987' : '#000000'}
      emissiveIntensity={0.15}
    />
  );
}
function Liquid({
  colour,
  radius = 0.145,
  height = 0.6,
  base = 0.08,
  opacity = 0.9,
}: {
  colour: string;
  radius?: number;
  height?: number;
  base?: number;
  opacity?: number;
}) {
  return (
    <mesh position={[0, height / 2 + base, 0]} renderOrder={1}>
      <cylinderGeometry args={[radius, radius, height, 28]} />
      <meshPhysicalMaterial
        color={colour}
        transparent
        opacity={opacity}
        depthWrite={false}
        roughness={0.22}
        envMapIntensity={0.4}
      />
    </mesh>
  );
}
function Tool({
  kind,
  selected,
  colour,
  precipitate,
  mirror,
  heating,
  sealed,
  bubbles,
}: {
  kind: TeachingApparatusKind;
  selected: boolean;
  colour: string;
  precipitate: string | null;
  mirror: boolean;
  heating: boolean;
  sealed: boolean;
  bubbles: boolean;
}) {
  if (['test_tube', 'boiling_tube', 'gas_collector'].includes(kind))
    return (
      <>
        <mesh geometry={TUBE} renderOrder={3}>
          <Glass selected={selected} />
        </mesh>
        <mesh position={[0, 1.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.17, 0.012, 8, 36]} />
          <meshStandardMaterial
            color={selected ? '#31b9e7' : '#729db7'}
            roughness={0.22}
            metalness={0.2}
          />
        </mesh>
        <Liquid
          colour={kind === 'gas_collector' ? '#a6d2e4' : colour}
          base={kind === 'gas_collector' ? 0.65 : 0.08}
          opacity={kind === 'gas_collector' || colour === TEACHING_COLOURS.clear ? 0.35 : 0.9}
        />
        {bubbles &&
          kind === 'test_tube' &&
          [0, 1, 2].map((n) => (
            <mesh key={n} position={[n % 2 ? 0.05 : -0.04, 0.2 + n * 0.14, 0.1]}>
              <sphereGeometry args={[0.035, 12, 8]} />
              <meshPhysicalMaterial color="#e6f5ff" transparent opacity={0.5} roughness={0.1} />
            </mesh>
          ))}
        {kind !== 'gas_collector' && precipitate && (
          <mesh position={[0, 0.1, 0]} renderOrder={4}>
            <sphereGeometry args={[0.135, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={precipitate} roughness={0.85} transparent opacity={0.98} />
          </mesh>
        )}
        {mirror && kind === 'test_tube' && (
          <mesh position={[0, 0.4, 0]} renderOrder={4}>
            <cylinderGeometry args={[0.157, 0.157, 0.5, 32, 1, true]} />
            <meshStandardMaterial
              color="#d4dce1"
              metalness={1}
              roughness={0.12}
              side={DoubleSide}
              transparent
              opacity={0.98}
            />
          </mesh>
        )}
        {sealed && kind === 'boiling_tube' && (
          <mesh position={[0, 1.29, 0]}>
            <cylinderGeometry args={[0.17, 0.19, 0.1, 24]} />
            <meshStandardMaterial color="#273e4d" />
          </mesh>
        )}
      </>
    );
  if (['beaker', 'water_bath', 'ice_bath'].includes(kind))
    return (
      <>
        <mesh geometry={BEAKER} renderOrder={3}>
          <Glass selected={selected} />
        </mesh>
        <Liquid colour="#b7dbe9" radius={0.54} height={0.38} opacity={0.3} />
        {kind === 'ice_bath' &&
          [-0.32, 0, 0.32].map((x) => (
            <mesh key={x} position={[x, 0.48, 0.15]} rotation={[0.2, x, 0.3]}>
              <boxGeometry args={[0.23, 0.2, 0.22]} />
              <meshPhysicalMaterial color="#eefaff" transmission={0.35} roughness={0.16} />
            </mesh>
          ))}
        {[0.2, 0.36, 0.52, 0.68].map((y) => (
          <mesh key={y} position={[0.5, y, 0.31]} rotation={[0, 0.55, 0]}>
            <boxGeometry args={[0.14, 0.01, 0.005]} />
            <meshBasicMaterial color="#33526a" />
          </mesh>
        ))}
      </>
    );
  if (kind === 'conical_flask')
    return (
      <mesh geometry={FLASK}>
        <Glass selected={selected} />
      </mesh>
    );
  if (kind === 'glass_rod')
    return (
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.4, 16]} />
        <Glass selected={selected} />
      </mesh>
    );
  if (kind === 'dropper')
    return (
      <>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.035, 0.025, 0.9, 16]} />
          <Glass selected={selected} />
        </mesh>
        <mesh position={[0, 1.1, 0]} scale={[1, 1.6, 1]}>
          <sphereGeometry args={[0.12, 24, 16]} />
          <meshStandardMaterial color={selected ? '#4aaad7' : '#234865'} roughness={0.65} />
        </mesh>
      </>
    );
  if (kind === 'reagent_bottle')
    return (
      <>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.8, 32]} />
          <meshStandardMaterial color={selected ? '#b4d5e6' : '#edf1ed'} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.88, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.15, 24]} />
          <meshStandardMaterial color="#234d70" />
        </mesh>
        <mesh position={[0, 0.43, 0.283]}>
          <planeGeometry args={[0.4, 0.28]} />
          <meshStandardMaterial color="white" />
        </mesh>
      </>
    );
  if (kind === 'burner')
    return (
      <>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.3, 0.34, 0.1, 24]} />
          <meshStandardMaterial color="#2b414f" />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.085, 0.1, 0.5, 20]} />
          <meshStandardMaterial color="#afc0cb" metalness={0.7} roughness={0.3} />
        </mesh>
        {heating && (
          <mesh position={[0, 0.77, 0]}>
            <coneGeometry args={[0.11, 0.4, 24]} />
            <meshBasicMaterial color="#67b9ed" transparent opacity={0.8} />
          </mesh>
        )}
      </>
    );
  if (kind === 'retort_stand')
    return (
      <>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.8, 0.08, 0.6]} />
          <meshStandardMaterial color="#4a5b69" />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2, 12]} />
          <meshStandardMaterial color="#b4c4ce" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.4, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.8, 12]} />
          <meshStandardMaterial color="#b4c4ce" metalness={0.7} />
        </mesh>
      </>
    );
  if (kind === 'delivery_tube')
    return (
      <mesh>
        <tubeGeometry args={[PIPE, 64, 0.035, 12, false]} />
        <Glass selected={selected} />
      </mesh>
    );
  if (kind === 'stopwatch')
    return (
      <group position={[0, 0.4, 0]} rotation={[-0.4, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.13, 32]} />
          <meshStandardMaterial color={selected ? '#429bc5' : '#314d65'} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <circleGeometry args={[0.29, 32]} />
          <meshStandardMaterial color="#edf6fb" />
        </mesh>
        <mesh position={[0, 0.11, 0.09]}>
          <boxGeometry args={[0.015, 0.22, 0.01]} />
          <meshBasicMaterial color="#263c53" />
        </mesh>
        <mesh position={[0.07, 0, 0.09]}>
          <boxGeometry args={[0.14, 0.015, 0.01]} />
          <meshBasicMaterial color="#263c53" />
        </mesh>
      </group>
    );
  return null;
}
class SceneBoundary extends Component<
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
export default function TeachingScene3D({
  definition: d,
  projection: p,
  selected,
  onSelect,
  zoom,
  reset,
}: TeachingSceneProps & { zoom: number; reset: number }) {
  const { t } = useTranslation();
  const fallback = <p role="status">{t('teaching.webgl_fallback')}</p>;
  return (
    <SceneBoundary fallback={fallback}>
      <Canvas
        className="teaching-scene3d"
        shadows
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ fov: 38, near: 0.1, far: 70 }}
        fallback={fallback}
        onCreated={({ gl }) => {
          gl.domElement.dataset.ready = 'true';
        }}
      >
        <color attach="background" args={['#124969']} />
        <Studio />
        <Camera zoom={zoom} reset={reset} />
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[2, 7, 5]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-4, 3, -3]} intensity={0.9} />
        <mesh position={[0, -0.1, 0]} receiveShadow>
          <boxGeometry args={[11, 0.2, 4]} />
          <meshStandardMaterial color="#657f91" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.5, -2]}>
          <boxGeometry args={[13, 4, 0.12]} />
          <meshStandardMaterial color="#164a6b" roughness={0.75} />
        </mesh>
        {[-3, 3].map((x) => (
          <mesh key={x} position={[x, -0.9, 0]}>
            <boxGeometry args={[3, 1.5, 3.4]} />
            <meshStandardMaterial color="#245378" roughness={0.45} />
          </mesh>
        ))}
        {d.apparatus.map((a) => {
          const pos = teachingPlacement(d, a.id);
          const pick = (event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            onSelect(a.id);
          };
          return (
            <group
              key={a.id}
              position={[pos.x, pos.y, pos.z]}
              rotation={[0, 0, pos.rotate]}
              onClick={pick}
            >
              {selected === a.id && (
                <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.27, 0.32, 40]} />
                  <meshBasicMaterial color="#42c6f1" side={DoubleSide} />
                </mesh>
              )}
              <Tool
                kind={a.kind}
                selected={selected === a.id}
                colour={TEACHING_COLOURS[p.scene.solutionColour]}
                precipitate={
                  p.scene.precipitateColour ? TEACHING_COLOURS[p.scene.precipitateColour] : null
                }
                mirror={p.scene.visual === 'silver_mirror'}
                heating={p.scene.phase === 'heat'}
                sealed={d.layout === 'gas_collection'}
                bubbles={p.scene.visual === 'bubbles'}
              />
            </group>
          );
        })}
      </Canvas>
    </SceneBoundary>
  );
}
