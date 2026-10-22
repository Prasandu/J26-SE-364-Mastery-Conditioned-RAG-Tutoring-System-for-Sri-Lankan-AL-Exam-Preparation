import { useRef, type ReactNode } from 'react';
import { Plane, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { BenchOffset } from './benchLayout';

/** Ray/bench-plane intersection; no reaction or engine state is changed by this gesture. */
export function MovableBenchGroup({
  id,
  position,
  rotation,
  offset,
  onMove,
  onSelect,
  onDragging,
  children,
}: {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  offset: BenchOffset;
  onMove: ((id: string, p: BenchOffset) => void) | undefined;
  onSelect: (id: string) => void;
  onDragging: (moving: boolean) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ point: Vector3; offset: BenchOffset; plane: Plane; moved: boolean } | null>(
    null,
  );
  const suppress = useRef(false);
  const release = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    suppress.current = drag.current.moved;
    drag.current = null;
    onDragging(false);
    (event.target as unknown as HTMLElement).releasePointerCapture?.(event.pointerId);
  };
  return (
    <group
      name={id}
      position={position}
      rotation={rotation}
      onPointerDown={(event) => {
        if (!onMove || event.button !== 0) return;
        event.stopPropagation();
        const plane = new Plane(new Vector3(0, 1, 0), -position[1]);
        const point = event.ray.intersectPlane(plane, new Vector3());
        if (!point) return;
        drag.current = { point, offset: { ...offset }, plane, moved: false };
        onSelect(id);
        onDragging(true);
        (event.target as unknown as HTMLElement).setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || !onMove) return;
        event.stopPropagation();
        const point = event.ray.intersectPlane(start.plane, new Vector3());
        if (!point) return;
        const delta = point.sub(start.point);
        if (delta.length() > 0.025) start.moved = true;
        if (start.moved) onMove(id, { x: start.offset.x + delta.x, z: start.offset.z + delta.z });
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onClick={(event) => {
        event.stopPropagation();
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        onSelect(id);
      }}
    >
      {children}
    </group>
  );
}
