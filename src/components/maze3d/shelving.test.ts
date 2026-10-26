// @vitest-environment node
import { Box3, Vector3, Matrix4, Quaternion } from 'three';
import { expect, it } from 'vitest';
import { SHELVING, SHELVING_KINDS, placeShelving, fitShelving, shelfYaw } from './shelving';
import { directionVector, type SceneBox } from './scene';
const source = (facing: NonNullable<SceneBox['facing']> = 'south'): SceneBox => ({ id: 'stable-wall/shelf', material: 'bookshelf',
  center: [7, 1.1, -5], size: facing === 'east' || facing === 'west' ? [.34, 2.2, 1.5] : [1.5, 2.2, .34], solid: true, facing });

for (const kind of SHELVING_KINDS) it.each(['north', 'east', 'south', 'west'] as const)(`${kind} keeps its mount plane and exact exported world scale facing %s`, facing => {
  const original = source(facing), box = placeShelving(original, kind), p = SHELVING[kind], n = directionVector[facing];
  const turned = facing === 'east' || facing === 'west', axis = turned ? 0 : 2, sign = turned ? n.x : n.z;
  expect(box.center[axis] - sign * box.size[axis] / 2).toBeCloseTo(original.center[axis] - sign * .17);
  expect(box.center[1] - box.size[1] / 2).toBeCloseTo(p.mount); expect(box.id).toBe(original.id); expect(box.solid).toBe(true);
  const bounds = new Box3(new Vector3(-p.width / 2, 0, -p.depth / 2), new Vector3(p.width / 2, p.height, p.depth / 2));
  bounds.applyMatrix4(new Matrix4().compose(new Vector3(box.center[0], box.center[1] - box.size[1] / 2, box.center[2]),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), shelfYaw[facing]), new Vector3(1, 1, 1)));
  for (let i = 0; i < 3; i++) { expect(bounds.min.getComponent(i)).toBeCloseTo(box.center[i] - box.size[i] / 2); expect(bounds.max.getComponent(i)).toBeCloseTo(box.center[i] + box.size[i] / 2); }
});
it('resolves two oversized corner cases deterministically and leaves the actor center clear', () => {
  const a: SceneBox = { ...source('south'), id: 'a', center: [0, 1.1, -1.35], furnishing: 'library' };
  const b: SceneBox = { ...source('east'), id: 'b', center: [-1.35, 1.1, 0], furnishing: 'library' };
  const before = JSON.stringify([a, b]), placed = fitShelving([a, b]);
  expect(placed.find(b => b.id === 'a')?.furnishing).toBe('library'); expect(placed.find(b => b.id === 'b')?.furnishing).toBe('low-bookcase');
  expect(fitShelving([b, a]).sort((a, b) => a.id.localeCompare(b.id))).toEqual(placed);
  for (const box of placed) expect(Math.abs(box.center[0]) > box.size[0] / 2 + .28 || Math.abs(box.center[2]) > box.size[2] / 2 + .28).toBe(true);
  expect(JSON.stringify([a, b])).toBe(before);
});
it('does not hide a chest inside decorative shelving, while leaving structural geometry unchanged', () => {
  const shelf = { ...source(), furnishing: 'cabinet' as const }, chest: SceneBox = { id: 'chest', material: 'chest', center: [7, .5, -5], size: [1, 1, 1], solid: true };
  expect(fitShelving([shelf, chest])).toEqual([chest]);
});
