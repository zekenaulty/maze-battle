// @vitest-environment node
import { expect, it } from 'vitest';
import { stairSupport, straightStair } from '../../assets3d/stairs/assembly';
import { CELL_SIZE, WALL_HEIGHT } from './constants';
import { cutStairDecks, SLAB_THICKNESS, stairEnclosure, WALL_THICKNESS, type SceneBox, type StageFlight } from './scene';

const flight: StageFlight = { id: 'translated-flight', upper: { x: 13.125, y: 8, z: -20.4 },
  lower: { x: 13.125, y: 3.32, z: -29.76 } };
const bounds = (box: SceneBox) => ({ min: box.center.map((c, i) => c - box.size[i] / 2), max: box.center.map((c, i) => c + box.size[i] / 2) });
const contains = (box: SceneBox, p: number[]) => { const b = bounds(box); return p.every((v, i) => v > b.min[i] + 1e-7 && v < b.max[i] - 1e-7); };
const overlap = (a: SceneBox, b: SceneBox) => { const aa = bounds(a), bb = bounds(b);
  return aa.min.reduce((volume, lo, i) => volume * Math.max(0, Math.min(aa.max[i], bb.max[i]) - Math.max(lo, bb.min[i])), 1); };

it('encloses both shaft sides continuously, including the former shared-slab slit', () => {
  const boxes = stairEnclosure(flight), stair = straightStair();
  const start = flight.lower.z + stair.landing / 2, end = flight.upper.z - stair.landing / 2;
  for (const sign of [-1, 1]) for (const z of [start + .001, (start + end) / 2, end - .001])
    for (const y of [flight.lower.y + .01, flight.upper.y - SLAB_THICKNESS / 2, flight.upper.y + WALL_HEIGHT - .01]) {
      const p = [flight.upper.x + sign * 1.2, y, z];
      expect(boxes.some(box => box.solid && contains(box, p)), JSON.stringify(p)).toBe(true);
    }
  for (const sign of [-1, 1]) {
    const outer = boxes.filter(b => contains(b, [flight.upper.x + sign * 1.679, flight.upper.y - .09, (start + end) / 2]));
    expect(outer).toHaveLength(1);
  }
});

it('closes the entire lower header and joins its jambs without lowering walking headroom', () => {
  const boxes = stairEnclosure(flight), header = boxes.find(b => b.id.endsWith('/lower-header'))!, h = bounds(header);
  expect(h.min[1]).toBeCloseTo(flight.upper.y - SLAB_THICKNESS);
  expect(h.max[1]).toBeCloseTo(flight.upper.y + WALL_HEIGHT);
  expect(h.min[2]).toBeCloseTo(flight.lower.z + CELL_SIZE / 2 - WALL_THICKNESS / 2);
  expect(h.max[2]).toBeCloseTo(flight.lower.z + CELL_SIZE / 2 + WALL_THICKNESS / 2);
  for (const x of [-.899, 0, .899]) for (const y of [flight.upper.y - .09, flight.upper.y + 2])
    expect(contains(header, [flight.lower.x + x, y, header.center[2]])).toBe(true);
  const stair = straightStair(), start = flight.lower.z + stair.landing / 2;
  for (let i = 0; i <= 200; i++) {
    const z = start + stair.run * i / 200, support = flight.lower.y + stairSupport(stair, z - start);
    for (const box of boxes.filter(b => b.solid)) {
      const b = bounds(box);
      if (flight.lower.x > b.min[0] && flight.lower.x < b.max[0] && z > b.min[2] && z < b.max[2])
        expect(b.min[1] - support).toBeGreaterThanOrEqual(2.7);
    }
  }
});

it('uses eighteen contiguous cobblestone steps and leaves rails opt-in', () => {
  const boxes = stairEnclosure(flight), steps = boxes.filter(b => b.id.includes('/step/')), stair = straightStair();
  expect(stair.rails).toBe(false);
  expect(stair.model.payload.geometries.flight.some(part => /rail|post/.test(part.id))).toBe(false);
  expect(boxes.some(b => /rail|post|landing/.test(b.id))).toBe(false);
  expect(steps).toHaveLength(18); expect(steps.every(b => b.material === 'cobblestone')).toBe(true);
  expect(bounds(steps[0]).min[2]).toBeCloseTo(flight.lower.z + .9);
  expect(bounds(steps.at(-1)!).max[2]).toBeCloseTo(flight.upper.z - .9);
  expect(bounds(steps[0]).max[1]).toBeCloseTo(flight.lower.y + .26);
  expect(bounds(steps.at(-1)!).max[1]).toBeCloseTo(flight.upper.y);
  for (let i = 1; i < steps.length; i++) {
    expect(bounds(steps[i - 1]).max[2]).toBeCloseTo(bounds(steps[i]).min[2]);
    expect(overlap(steps[i - 1], steps[i])).toBeCloseTo(0);
  }
});

it('cuts both owners of the upper slab without a top-step overlap or a premature lower ceiling gap', () => {
  const deck = (kind: 'floor' | 'ceiling', y = flight.upper.y): SceneBox => ({ id: 'room/' + kind + '/' + y, deck: kind,
    material: kind === 'floor' ? 'cobblestone' : 'stone_bricks', center: [flight.upper.x, y - .09, (flight.upper.z + flight.lower.z) / 2],
    size: [3.2, .18, 13], solid: false });
  const input = [deck('floor'), deck('ceiling'), deck('floor', flight.lower.y), deck('ceiling', flight.upper.y + 4.68)];
  const cut = cutStairDecks(input, [flight]), steps = stairEnclosure(flight).filter(b => b.id.includes('/step/'));
  for (const box of cut.filter(b => Math.abs(bounds(b).max[1] - flight.upper.y) < 1e-7))
    for (const step of steps) expect(overlap(box, step)).toBeCloseTo(0, 7);
  const underHeader = [flight.upper.x, flight.upper.y - .09, flight.lower.z + 1.51];
  expect(cut.filter(b => contains(b, underHeader)).map(b => b.deck).sort()).toEqual(['ceiling', 'floor']);
  const opening = [flight.upper.x, flight.upper.y - .09, flight.lower.z + 1.53];
  expect(cut.some(b => contains(b, opening))).toBe(false);
  expect(cut).toContain(input[2]); expect(cut).toContain(input[3]);
});
