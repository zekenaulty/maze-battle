// @vitest-environment node
import { expect, it } from 'vitest';
import type { SceneBox } from './scene';
import { ceilingTimbers, timberGeometry, TIMBER, type TimberMember } from './timber';
type V = [number, number, number];
const roof = (id: string, x: number, z: number, w: number, d: number): SceneBox => ({ id, deck: 'ceiling', material: 'stone_bricks',
  center: [x, 4.89, z], size: [w, .18, d], solid: false, textureOrigin: [-3.2, 0, -4.8] });
const wall = (id: string, x: number, z: number, w: number, d: number): SceneBox => ({ id, material: 'stone_bricks',
  center: [x, 2.4, z], size: [w, 4.8, d], solid: true });
const room = () => [roof('room', 0, 0, 6.4, 9.6), wall('north', 0, -4.8, 6.56, .16), wall('south', 0, 4.8, 6.56, .16),
  wall('west', -3.2, 0, .16, 9.6), wall('east', 3.2, 0, .16, 9.6)];
const overlaps = (a: { min: V; max: V }, b: { min: V; max: V }) => a.min.every((v, i) => v < b.max[i] - 1e-6 && a.max[i] > b.min[i] + 1e-6);
const signature = (m: TimberMember) => JSON.stringify([m.role, m.axis, m.min, m.max]);

it('fits the actual interior planes, keeps player/door headroom and joins tiers without overlapping trim corners', () => {
  const boxes = room(), before = JSON.stringify(boxes), members = ceilingTimbers(boxes);
  expect(new Set(members.map(m => m.role))).toEqual(new Set(['joist', 'rafter', 'trim']));
  for (const member of members) {
    expect(member.min[0]).toBeGreaterThanOrEqual(-3.12 - 1e-6); expect(member.max[0]).toBeLessThanOrEqual(3.12 + 1e-6);
    expect(member.min[2]).toBeGreaterThanOrEqual(-4.72 - 1e-6); expect(member.max[2]).toBeLessThanOrEqual(4.72 + 1e-6);
    expect(member.min[1]).toBeGreaterThan(3.3); expect(member.max[1]).toBeLessThanOrEqual(4.8 + 1e-6);
  }
  expect(Math.min(...members.map(m => m.min[1]))).toBeCloseTo(4.128);
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) expect(overlaps(members[i], members[j])).toBe(false);
  expect(JSON.stringify(boxes)).toBe(before);
});

it('clips the whole cross section against a stair roof opening and leaves no timber in its void', () => {
  const boxes = [roof('left', -2.05, 0, 2.3, 9.6), roof('right', 2.05, 0, 2.3, 9.6),
    roof('front', 0, 3.65, 1.8, 2.3), roof('back', 0, -3.65, 1.8, 2.3)];
  const hole = { min: [-.9, 3, -2.5] as V, max: [.9, 5, 2.5] as V }, members = ceilingTimbers(boxes);
  expect(members.length).toBeGreaterThan(10); expect(members.every(m => !overlaps(m, hole))).toBe(true);
  expect(members.some(m => m.axis === 0 && Math.abs(m.max[0] + .9) < 1e-6)).toBe(true);
  expect(members.some(m => m.axis === 2 && Math.abs(m.min[2] - 2.5) < 1e-6)).toBe(true);
});

it('does not split beams at adjacent cell seams or make their pattern depend on input order', () => {
  const boxes = [roof('a', -1.6, 0, 3.2, 9.6), roof('b', 1.6, 0, 3.2, 9.6)];
  const members = ceilingTimbers(boxes);
  expect(members.filter(m => m.role === 'joist').every(m => m.max[0] - m.min[0] === 6.4)).toBe(true);
  expect(members.map(signature).sort()).toEqual(ceilingTimbers([...boxes].reverse()).map(signature).sort());
});

it('keeps spanwise grain phase under origin rebasing and uses normalized end grain on both orientations', () => {
  const boxes = room(), offset: V = [64.125, -4.98, -31.875];
  const moved = boxes.map(b => ({ ...b, center: b.center.map((v, i) => v + offset[i]) as V,
    ...(b.textureOrigin ? { textureOrigin: b.textureOrigin.map((v, i) => v + offset[i]) as V } : {}) }));
  const a = ceilingTimbers(boxes), b = ceilingTimbers(moved); expect(b.length).toBe(a.length);
  for (let i = 0; i < a.length; i++) {
    const ga = timberGeometry(a[i]), gb = timberGeometry(b[i]);
    const uv = ga.sides.getAttribute('uv'), other = gb.sides.getAttribute('uv');
    [...uv.array].forEach((v, j) => expect(other.array[j]).toBeCloseTo(v, 5));
    const caps = ga.ends.index!, normals = ga.ends.getAttribute('normal'), capUV = ga.ends.getAttribute('uv');
    for (let j = 0; j < caps.count; j++) {
      const k = caps.getX(j); expect(Math.abs(normals.getComponent(k, a[i].axis))).toBe(1);
      expect(capUV.getX(k)).toBeGreaterThanOrEqual(0); expect(capUV.getX(k)).toBeLessThanOrEqual(1);
      expect(capUV.getY(k)).toBeGreaterThanOrEqual(0); expect(capUV.getY(k)).toBeLessThanOrEqual(1);
    }
    ga.sides.dispose(); ga.ends.dispose(); gb.sides.dispose(); gb.ends.dispose();
  }
});

it('preserves physical grain density across reservation fragments instead of stretching each beam to one tile', () => {
  const full: TimberMember = { role: 'joist', axis: 0, min: [-6.4, 4.128, -.192], max: [6.4, 4.576, .192], origin: [0, 0, 0] };
  for (const member of [full, { ...full, min: [1.6, 4.128, -.192] as V }]) {
    const { sides, ends } = timberGeometry(member), p = sides.getAttribute('position'), n = sides.getAttribute('normal'), uv = sides.getAttribute('uv');
    for (let i = 0; i < p.count; i++) if (n.getX(i) === 0) expect(uv.getY(i)).toBeCloseTo(p.getX(i) / TIMBER.tile, 5);
    sides.dispose(); ends.dispose();
  }
});

it('keeps an unchanged bay pattern as more disclosed ceiling cells appear', () => {
  const initial = ceilingTimbers([roof('first', -1.6, 0, 3.2, 9.6)]);
  const extended = ceilingTimbers([roof('first', -1.6, 0, 3.2, 9.6), roof('next', 1.6, 0, 3.2, 9.6)]);
  expect(initial.filter(m => m.role === 'rafter').map(m => m.min[0])).toEqual(extended.filter(m => m.role === 'rafter' && m.min[0] < 0).map(m => m.min[0]));
  expect(ceilingTimbers([])).toEqual([]);
});
