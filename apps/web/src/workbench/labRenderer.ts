import type { SceneModel } from './sceneModel';

/**
 * Contract shared by the 2D and 3D laboratory renderers. A renderer draws the shared scene model
 * and reports gestures; it never holds experiment state and never dispatches engine actions itself.
 */
export interface LabRendererProps {
  model: SceneModel;
  /** Optional shared control bar, outside the drawing so presets do not consume scene height. */
  toolbarTarget?: HTMLElement | null;
  /**
   * Click / tap on an item, or on the free bench (`BENCH_TARGET`). The viewport decides whether
   * this selects the item or places the item currently held.
   */
  onPick: (itemId: string) => void;
  /** Accessible name of the scene region. */
  label: string;
  /** Item currently picked up (drawn lifted), if any. */
  heldItemId?: string | null;
  /** Direct drag of one item onto a target (2D pointer drag). */
  onDrop?: (sourceId: string, targetId: string) => void;
  setupTargetId?: string | null | undefined;
  onSetupAnchor?: ((point: readonly [number, number]) => void) | undefined;
  arrange?: boolean | undefined;
  onArrange?: ((id: string, point: { x: number; z: number }) => void) | undefined;
}

/**
 * Stable target attribute on every interactive item (2D: DOM attribute; 3D: object name). The
 * interaction controller resolves source/target gestures through these IDs.
 */
export const LAB_ITEM_ATTRIBUTE = 'data-lab-item';
