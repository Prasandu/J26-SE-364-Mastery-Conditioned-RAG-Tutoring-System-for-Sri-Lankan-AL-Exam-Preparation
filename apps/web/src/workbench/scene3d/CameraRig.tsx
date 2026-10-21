import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fittedOverviewPose, type CameraPose } from './layout3d';

/** Imperative camera API used by the DOM toolbar outside the canvas. */
export interface CameraApi {
  goTo(pose: CameraPose): void;
  /** factor < 1 moves closer, > 1 moves away (clamped to the orbit limits). */
  zoom(factor: number): void;
}

const LIMITS = {
  minDistance: 1.3,
  maxDistance: 32,
  minPolarAngle: 0.2,
  // Slightly past horizontal so the eye-level mark view is reachable, never below the bench.
  maxPolarAngle: Math.PI / 2 + 0.03,
  minAzimuthAngle: -1.1,
  maxAzimuthAngle: 1.1,
} as const;

const DURATION_MS = 600;

interface Flight {
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  start: number;
}

/**
 * Orbit/zoom within safe limits (three's own OrbitControls; no extra dependency) plus animated
 * preset flights. Rendering stays on demand: frames are requested only while something moves.
 */
export function CameraRig({
  initial,
  reducedMotion,
  onReady,
}: {
  initial: CameraPose;
  reducedMotion: boolean;
  onReady: (api: CameraApi) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const flight = useRef<Flight | null>(null);
  const initialRef = useRef(initial);
  const overview = useRef(true);

  useEffect(() => {
    Object.assign(controls, LIMITS, { enablePan: false, enableDamping: false });
    camera.position.set(...initialRef.current.position);
    controls.target.set(...initialRef.current.target);
    controls.update();
    const onChange = () => invalidate();
    const onInteract = () => {
      overview.current = false;
    };
    controls.addEventListener('change', onChange);
    controls.addEventListener('start', onInteract);
    return () => {
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('start', onInteract);
      controls.dispose();
    };
  }, [controls, camera, invalidate]);

  useEffect(() => {
    if (!overview.current) return;
    const pose = fittedOverviewPose(aspect);
    flight.current = null;
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
    invalidate();
  }, [aspect, camera, controls, invalidate]);

  useEffect(() => {
    const fly = (toPos: Vector3, toTarget: Vector3) => {
      if (reducedMotion) {
        camera.position.copy(toPos);
        controls.target.copy(toTarget);
        controls.update();
        invalidate();
        return;
      }
      flight.current = {
        fromPos: camera.position.clone(),
        toPos,
        fromTarget: controls.target.clone(),
        toTarget,
        start: performance.now(),
      };
      invalidate();
    };
    onReady({
      goTo: (pose) => {
        overview.current = pose === initialRef.current;
        const next = overview.current ? fittedOverviewPose(aspect) : pose;
        fly(new Vector3(...next.position), new Vector3(...next.target));
      },
      zoom: (factor) => {
        overview.current = false;
        const offset = camera.position.clone().sub(controls.target);
        const distance = Math.min(
          LIMITS.maxDistance,
          Math.max(LIMITS.minDistance, offset.length() * factor),
        );
        fly(controls.target.clone().add(offset.setLength(distance)), controls.target.clone());
      },
    });
  }, [aspect, camera, controls, invalidate, onReady, reducedMotion]);

  useFrame(() => {
    const f = flight.current;
    if (!f) return;
    const k = Math.min(1, (performance.now() - f.start) / DURATION_MS);
    const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    camera.position.lerpVectors(f.fromPos, f.toPos, eased);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, eased);
    controls.update();
    if (k < 1) invalidate();
    else flight.current = null;
  });

  return null;
}
