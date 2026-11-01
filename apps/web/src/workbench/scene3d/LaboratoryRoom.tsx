import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RISER } from './layout3d';

type Triple = [number, number, number];

function Block({
  position,
  size,
  color,
  metalness = 0,
  roughness = 0.55,
}: {
  position: Triple;
  size: Triple;
  color: string;
  metalness?: number;
  roughness?: number;
}) {
  const [width, height, depth] = size;
  const geometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        width,
        height,
        depth,
        2,
        Math.min(0.04, width / 6, height / 6, depth / 6),
      ),
    [width, height, depth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={position} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/** Architectural scenery only. No extra apparatus or experiment controls. */
export function LaboratoryRoom({ onBench }: { onBench: () => void }) {
  // Original fine epoxy grain, generated locally; no remote images or texture requests.
  const worktopTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      const image = context.createImageData(128, 128);
      for (let pixel = 0; pixel < image.data.length; pixel += 4) {
        const shade = 223 + ((pixel * 17 + (pixel >> 5)) % 15);
        image.data.set([shade, shade + 2, shade + 4, 255], pixel);
      }
      context.putImageData(image, 0, 0);
    }
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(6, 4);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => worktopTexture.dispose(), [worktopTexture]);
  return (
    <group>
      <Block position={[0, 3, -5]} size={[30, 12, 0.18]} color="#aab8c2" />
      <Block position={[-8, 2, 0]} size={[0.18, 10, 18]} color="#a3b4bf" />
      <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#748593" roughness={0.72} />
      </mesh>
      <gridHelper args={[30, 30, '#8f9eaa', '#9eacb7']} position={[0, -2.495, 0]} />
      <gridHelper
        args={[24, 24, '#c0ccd3', '#cbd5dc']}
        position={[0, 2, -4.89]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* A recessed daylight window and solid reveals give the room a believable light source. */}
      <Block
        position={[3.8, 3.3, -4.78]}
        size={[4.4, 3.4, 0.18]}
        color="#7e96a8"
        metalness={0.45}
      />
      <mesh position={[3.8, 3.3, -4.67]}>
        <planeGeometry args={[4.12, 3.12]} />
        <meshStandardMaterial
          color="#d7ecf9"
          emissive="#cce7fa"
          emissiveIntensity={0.2}
          roughness={0.15}
        />
      </mesh>
      <Block
        position={[3.8, 3.3, -4.57]}
        size={[0.08, 3.15, 0.1]}
        color="#e7edf0"
        metalness={0.35}
      />
      <Block
        position={[3.8, 3.3, -4.57]}
        size={[4.15, 0.08, 0.1]}
        color="#e7edf0"
        metalness={0.35}
      />
      <Block position={[3.8, 1.65, -4.5]} size={[4.65, 0.12, 0.5]} color="#f1f4f5" />

      {/* Background storage is architectural furniture, not interactive lab equipment. */}
      {[-5.5, -3.7].map((x) => (
        <group key={x}>
          <Block position={[x, 2.4, -4.5]} size={[1.72, 2.5, 0.65]} color="#b6c5ce" />
          <Block
            position={[x, 2.4, -4.15]}
            size={[1.55, 2.3, 0.06]}
            color="#24465f"
            roughness={0.28}
          />
          <Block
            position={[x + 0.55, 2.15, -4.08]}
            size={[0.04, 0.4, 0.06]}
            color="#c4d2db"
            metalness={0.8}
            roughness={0.2}
          />
        </group>
      ))}
      <Block position={[-3.6, 0.7, -4.7]} size={[5.6, 0.12, 0.9]} color="#eef2f4" />
      <Block position={[-3.6, -0.4, -4.8]} size={[5.5, 2.1, 0.65]} color="#4b677c" />

      {/* The worktop retains the existing shared bench hit target. */}
      <mesh
        position={[0, -0.12, 0]}
        receiveShadow
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.delta <= 6) onBench();
        }}
      >
        <boxGeometry args={[9.8, 0.24, 5.8]} />
        <meshPhysicalMaterial
          color="#aab8c2"
          map={worktopTexture}
          roughness={0.36}
          metalness={0.08}
          clearcoat={0.18}
          clearcoatRoughness={0.4}
        />
      </mesh>
      <Block position={[0, -0.29, 0]} size={[9.6, 0.1, 5.6]} color="#304c62" metalness={0.3} />
      <Block position={[0, -1.35, 0.1]} size={[9.45, 2.1, 5.3]} color="#213d54" />
      {[-3.55, -1.18, 1.18, 3.55].map((x) => (
        <group key={x}>
          {[-0.65, -1.3, -1.95].map((y) => (
            <group key={y}>
              <Block
                position={[x, y, 2.79]}
                size={[2.25, 0.59, 0.08]}
                color="#31546f"
                roughness={0.38}
                metalness={0.12}
              />
              <Block
                position={[x, y + 0.1, 2.86]}
                size={[0.62, 0.045, 0.055]}
                color="#c6d3dc"
                metalness={0.85}
                roughness={0.22}
              />
            </group>
          ))}
        </group>
      ))}
      <Block position={[0, -2.43, 0.1]} size={[9.2, 0.1, 5.1]} color="#172a39" />

      {/* Open stainless shelf: depth and legs replace the old solid gray riser. */}
      <Block
        position={[RISER.x, RISER.height - 0.05, RISER.z]}
        size={[RISER.width, 0.1, RISER.depth]}
        color="#a8bbc7"
        metalness={0.75}
        roughness={0.23}
      />
      {[-2.5, 4.1].map((x) => (
        <Block
          key={x}
          position={[x, 0.27, RISER.z]}
          size={[0.08, 0.54, 0.5]}
          color="#637e91"
          metalness={0.65}
          roughness={0.3}
        />
      ))}
    </group>
  );
}
