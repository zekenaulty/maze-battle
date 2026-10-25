// @vitest-environment node
import { expect, it } from 'vitest';
import { stageBoxGeometry } from './surfaces';
import { cutStairDecks, type SceneBox } from './scene';
const deck = (kind: 'floor' | 'ceiling'): SceneBox => ({ id: kind, deck: kind, material: kind, solid: false,
  center: [0, -.09, 0], size: [3.2, .18, 3.2] });
it('keeps standalone fallback boxes closed on both sides', () => {
  const floor = stageBoxGeometry(deck('floor'), true), ceiling = stageBoxGeometry(deck('ceiling'), true);
  const normals = (g: typeof floor) => [...g.index!.array].map(i => g.getAttribute('normal').getY(i));
  for (const geometry of [floor, ceiling]) {
    expect(normals(geometry).filter(y => y === 1)).toHaveLength(6);
    expect(normals(geometry).filter(y => y === -1)).toHaveLength(6);
  }
  expect(floor.getAttribute('uv').array.every(Number.isFinite)).toBe(true); floor.dispose(); ceiling.dispose();
});
it('cuts the physical flight from both phase-shifted upper floor and lower ceiling without changing slab height', () => {
  const input = [deck('floor'), { ...deck('ceiling'), center: [.4, -.09, .2] as [number, number, number] }];
  const flights = [{ id: 'stairs', upper: { x: 0, y: 0, z: 2.5 }, lower: { x: 0, y: -4.68, z: -6.86 } }];
  const output = cutStairDecks(input, flights);
  for (const box of output) {
    expect(box.center[1]).toBe(-.09); expect(box.size[1]).toBe(.18);
    const x = Math.max(0, Math.min(box.center[0] + box.size[0] / 2, .9) - Math.max(box.center[0] - box.size[0] / 2, -.9));
    const z = Math.max(0, Math.min(box.center[2] + box.size[2] / 2, 1.6) - Math.max(box.center[2] - box.size[2] / 2, -5.34));
    expect(x * z).toBeCloseTo(0);
  }
  expect(output.some(b => b.deck === 'floor')).toBe(true); expect(output.some(b => b.deck === 'ceiling')).toBe(true);
  expect(input).toHaveLength(2);
});
