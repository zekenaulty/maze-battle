import { expect, it } from 'vitest';
import { clipConstructionMembers, planRoomConstruction, ROOM_CONSTRUCTION, validateConstructionPlan } from './roomPlan';
import { subtractIntervals, unionIntervals } from './intervals';

it('plans empty/library programs with named supports, reserved routes and bounded spans before rendering', () => {
  for (const rows of [3, 5] as const) for (const columns of [3, 5] as const) for (const purpose of ['empty', 'library'] as const) {
    const brief = { id: 'room', seed: 42, rows, columns, purpose };
    const p = planRoomConstruction(brief);
    expect(planRoomConstruction(brief)).toEqual(p);
    expect(p.furnishings.length > 0).toBe(purpose === 'library');
    const anchors = new Map(p.anchors.map(a => [a.id, a])), members = new Map(p.members.map(m => [m.id, m]));
    for (const m of p.members.filter(m => m.material === 'timber')) {
      expect(m.max[m.axis] - m.min[m.axis]).toBeLessThanOrEqual(ROOM_CONSTRUCTION.maxBay + 1e-6);
      expect(m.bearings).toHaveLength(2);
      for (const id of m.bearings!) {
        const a = anchors.get(id)!; expect(a).toBeDefined();
        const support = members.get(a.supportedBy!)!; expect(support).toBeDefined();
        expect(a.position.every((v, i) => v >= support.min[i] - 1e-6 && v <= support.max[i] + 1e-6)).toBe(true);
      }
    }
  }
});

it('keeps parent member identity, UV datum and real end caps across visibility/batch fragments', () => {
  const p = planRoomConstruction({ id: 'clips', seed: 1, rows: 5, columns: 5, purpose: 'empty' });
  const m = p.members.find(m => m.role === 'joist')!, middle = (m.min[0] + m.max[0]) / 2;
  const one = clipConstructionMembers(p, [{ min: m.min, max: [middle, m.max[1], m.max[2]] }]).filter(f => f.memberId === m.id);
  expect(one).toHaveLength(1); expect(one[0]).toMatchObject({ memberId: m.id, capStart: true, capEnd: false });
  const full = clipConstructionMembers(p, [{ min: m.min, max: [middle, m.max[1], m.max[2]] },
    { min: [middle, m.min[1], m.min[2]], max: m.max }]).filter(f => f.memberId === m.id);
  expect(full).toHaveLength(1); expect(full[0]).toMatchObject({ capStart: true, capEnd: true, min: m.min, max: m.max });
  expect(m.uvOrigin).toEqual([0, 0, 0]);
});

it('rejects unsupported programs, excessive work and missing support references', () => {
  expect(() => planRoomConstruction({ id: 'x', seed: 1, rows: 7, columns: 3, purpose: 'empty' } as never)).toThrow();
  const p = planRoomConstruction({ id: 'x', seed: 1, rows: 3, columns: 3, purpose: 'empty' });
  p.anchors.find(a => a.kind === 'post-top')!.supportedBy = 'absent';
  expect(() => validateConstructionPlan(p)).toThrow('Missing construction support');
  expect(() => clipConstructionMembers(p, Array.from({ length: 257 }, () => p.bounds))).toThrow('clip budget');
  const input: [number, number][] = [[3, 4], [0, 2], [1, 3]];
  expect(unionIntervals(input)).toEqual([[0, 4]]); expect(input[0]).toEqual([3, 4]);
  expect(subtractIntervals([[0, 10]], [[1, 3], [2, 5], [8, 12]])).toEqual([[0, 1], [5, 8]]);
});
