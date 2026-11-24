import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';

/** Project the actual tool position after orbit/resize; this is presentation geometry only. */
export function InstrumentSetupAnchor({
  position,
  onChange,
}: {
  position: readonly [number, number, number];
  onChange: ((point: readonly [number, number]) => void) | undefined;
}) {
  const last = useRef<readonly [number, number] | null>(null);
  const point = useRef(new Vector3());
  useFrame(({ camera }) => {
    if (!onChange) return;
    const p = point.current.set(...position).project(camera);
    const next = [(p.x + 1) / 2, (1 - p.y) / 2] as const;
    if (
      !last.current ||
      Math.abs(next[0] - last.current[0]) + Math.abs(next[1] - last.current[1]) > 0.002
    ) {
      last.current = next;
      onChange(next);
    }
  });
  return null;
}
