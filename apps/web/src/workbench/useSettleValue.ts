import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Smoothly interpolates a displayed number toward `target` (same cubic ease-in-out idiom as the
 * 3D `CameraRig` flight, kept native rather than adding an animation library). The caller decides
 * when `target` is allowed to change — this hook only animates the transition, it never decides
 * whether a change is valid, so a rejected engine action never reaches here with a new target.
 * With `prefers-reduced-motion: reduce`, the displayed value jumps straight to `target`.
 */
export function useSettleValue(target: number, durationMs = 450): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    // Reduced motion: let the very first animation frame finish the transition instead of
    // calling setState synchronously from inside the effect body.
    const effectiveDuration = prefersReducedMotion() ? 0 : durationMs;
    const start = performance.now();
    const tick = (now: number) => {
      const k = effectiveDuration <= 0 ? 1 : Math.min(1, (now - start) / effectiveDuration);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setDisplay(from + (target - from) * eased);
      if (k < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return display;
}
