/** Presentation coordinates only. Moving a drawing does not perform a chemical action. */
export interface BenchOffset {
  x: number;
  z: number;
}
export type BenchOffsets = Readonly<Record<string, BenchOffset>>;
export const boundedOffset = (p: BenchOffset): BenchOffset => ({
  x: Math.max(-4, Math.min(4, p.x)),
  z: Math.max(-1.1, Math.min(1.1, p.z)),
});

/** Clamp a connected assembly as a whole, so its members stay on the visible worktop. */
export function moveBenchAssembly(
  nodes: readonly { id: string; x: number; z: number; radius?: number }[],
  offsets: BenchOffsets,
  id: string,
  requested: BenchOffset,
  connected: readonly string[] = [],
): BenchOffsets {
  const members = nodes.filter(
    (n) => n.id === id || (connected.includes(id) && connected.includes(n.id)),
  );
  if (!members.length) return offsets;
  const current = offsets[id] ?? { x: 0, z: 0 };
  const next = boundedOffset(requested);
  const dx = Math.max(
    Math.max(...members.map((n) => -4.95 + (n.radius ?? 0.5) - n.x)),
    Math.min(Math.min(...members.map((n) => 4.95 - (n.radius ?? 0.5) - n.x)), next.x - current.x),
  );
  const dz = Math.max(
    Math.max(...members.map((n) => -0.8 - n.z)),
    Math.min(Math.min(...members.map((n) => 1.1 - n.z)), next.z - current.z),
  );
  const result = { ...offsets };
  for (const member of members) {
    const previous = offsets[member.id] ?? { x: 0, z: 0 };
    result[member.id] = { x: previous.x + dx, z: previous.z + dz };
  }
  return result;
}
