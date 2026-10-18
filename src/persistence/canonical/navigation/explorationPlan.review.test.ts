// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import { DIRECTIONS, type ObservedCell } from '../knowledge/types';
import type { WorldPosition } from '../world/types';
import { planLocalExploration, planScopedApproach } from './explorationPlan';

type Point = readonly [number, number];
const key = ([row, column]: Point) => `${row}:${column}`;
const worldPoint = (at: WorldPosition): Point => [at.cell.row - 64, at.cell.column - 64];
const deltas: Record<typeof DIRECTIONS[number], Point> = {
  north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1],
};

// Private fixture geometry only. Production planners receive earned pages, never this graph.
function geometry() {
  const nodes = new Map<string, { point: Point; spaceId: string; links: Map<string, Point> }>();
  function path(corners: Point[]) {
    const points: Point[] = [corners[0]];
    for (const next of corners.slice(1)) {
      let at = points.at(-1)!;
      if (at[0] !== next[0] && at[1] !== next[1]) throw Error('Fixture segment must be cardinal');
      while (key(at) !== key(next)) {
        at = [at[0] + Math.sign(next[0] - at[0]), at[1] + Math.sign(next[1] - at[1])];
        points.push(at);
      }
    }
    for (const point of points) if (!nodes.has(key(point)))
      nodes.set(key(point), { point, spaceId: 'room', links: new Map() });
    for (let i = 1; i < points.length; i++) {
      nodes.get(key(points[i - 1]))!.links.set(key(points[i]), points[i]);
      nodes.get(key(points[i]))!.links.set(key(points[i - 1]), points[i - 1]);
    }
    return points;
  }
  const position = (point: Point): WorldPosition => ({ level: 1,
    cell: { spaceId: nodes.get(key(point))!.spaceId, row: point[0] + 64, column: point[1] + 64 } });
  function distances(origin: Point, radius = Infinity) {
    const result = new Map([[key(origin), 0]]), queue = [origin];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i], distance = result.get(key(at))!;
      if (distance === radius) continue;
      for (const next of nodes.get(key(at))!.links.values()) if (!result.has(key(next))) {
        result.set(key(next), distance + 1); queue.push(next);
      }
    }
    return result;
  }
  function sight(origin: Point): ObservedCell[] {
    const visible = distances(origin, 7);
    return [...visible.keys()].map(id => {
      const { point, spaceId, links } = nodes.get(id)!;
      const cell = earnedCell(point[0], point[1], spaceId, point[0] + 64, point[1] + 64);
      cell.chests = []; cell.edges = {};
      for (const direction of DIRECTIONS) {
        const [dr, dc] = deltas[direction], next: Point = [point[0] + dr, point[1] + dc];
        if (!links.has(key(next))) cell.edges[direction] = null;
        else if (visible.has(key(next))) cell.edges[direction] = position(next);
      }
      return cell;
    });
  }
  return { nodes, path, position, distances, sight };
}

async function learned(shape: ReturnType<typeof geometry>, actor: Point, frontier: Point) {
  const f = knowledgeFixture(), distance = shape.distances(frontier);
  // Earn the graph without ever observing the cell beyond the selected boundary.
  for (const { point } of shape.nodes.values()) if (distance.get(key(point))! >= 7)
    await f.observe(shape.sight(point));
  await f.observe(shape.sight(actor));
  return f;
}
const memory = (f: ReturnType<typeof knowledgeFixture>) => structuredClone(
  [...f.records].filter(([id]) => id.startsWith('perception/cell/')));

describe('independent rolling exploration policy review', () => {
  it('reaches a retained target rather than cycling between rolling route windows', async () => {
    const shape = geometry(), a: Point = [-4, 0], b: Point = [4, 0], goal: Point = [-6, -5];
    // A-B is exactly one retained 16-step prefix. Each window excludes a different suffix to G.
    shape.path([a, [-2, 0], [-2, 4], [2, 4], [2, 0], b]);
    shape.path([a, [-4, -8], [8, -8], [8, -9], [-6, -9], goal]);
    shape.path([b, [4, 8], [-8, 8], [-8, -5], goal]);
    shape.path([goal, [-6, -4]]);
    const f = await learned(shape, a, goal), before = memory(f);
    const initial = await planLocalExploration(f.pages, f.checkpoint(), 'room');
    expect(initial?.target).toEqual(shape.position(goal));
    let route = initial!.route, moves = 0;
    const boundaries: Point[] = [a];
    while (moves < 64 && key(worldPoint(f.checkpoint().position)) !== key(goal)) {
      for (const step of route) { await f.observe(shape.sight(worldPoint(step.to))); moves++; }
      boundaries.push(worldPoint(f.checkpoint().position));
      if (key(boundaries.at(-1)!) === key(goal)) break;
      const refill = await planScopedApproach(f.pages, f.checkpoint(), initial!.target, initial!.window);
      expect(refill?.length).toBeGreaterThan(0); route = refill!;
    }
    // The buggy draft produces [A, B, A, B, A] with no newly earned memory at all.
    if (key(boundaries.at(-1)!) !== key(goal)) expect(memory(f)).toEqual(before);
    expect({ position: boundaries.at(-1), boundaries }).toMatchObject({ position: goal });
  });

  it('can refill an admitted U-shaped path when recentering would exclude its target', async () => {
    const shape = geometry(), actor: Point = [0, 0], goal: Point = [-10, 2];
    shape.path([actor, [10, 0], [10, 2], goal, [-10, 3]]);
    const f = await learned(shape, actor, goal);
    const initial = await planLocalExploration(f.pages, f.checkpoint(), 'room');
    expect(initial?.target).toEqual(shape.position(goal)); expect(initial?.route).toHaveLength(16);
    for (const step of initial!.route) await f.observe(shape.sight(worldPoint(step.to)));
    expect(worldPoint(f.checkpoint().position)).toEqual([6, 2]);
    const refill = await planScopedApproach(f.pages, f.checkpoint(), initial!.target, initial!.window);
    expect(refill).toHaveLength(16);
    expect(refill!.at(-1)!.to).toEqual(initial!.target);
  });

  it('backtracks around a local U instead of requiring movement toward the target coordinate', async () => {
    const shape = geometry(), actor: Point = [0, 0], goal: Point = [0, 1];
    shape.path([actor, [3, 0], [3, 1], goal, [-1, 1]]);
    const f = knowledgeFixture(); await f.observe(shape.sight(actor));
    const plan = await planLocalExploration(f.pages, f.checkpoint(), 'room');
    expect(plan?.target).toEqual(shape.position(goal)); expect(plan?.route).toHaveLength(7);
    expect(plan?.route[0].direction).toBe('south'); expect(plan?.route.at(-1)!.to).toEqual(shape.position(goal));
  });

  it('uses the longer same-space route and refuses a cross-space-only shortcut', async () => {
    for (const localRoute of [true, false]) {
      const shape = geometry(), actor: Point = [0, 0], goal: Point = [0, 2];
      shape.path([actor, goal]); shape.nodes.get('0:1')!.spaceId = 'other-room';
      if (localRoute) shape.path([actor, [2, 0], [2, 2], goal]);
      const f = knowledgeFixture(); await f.observe(shape.sight(actor));
      const route = await planScopedApproach(f.pages, f.checkpoint(), shape.position(goal));
      if (!localRoute) expect(route).toBeNull();
      else {
        expect(route).toHaveLength(6); expect(route!.every(step => step.to.cell.spaceId === 'room')).toBe(true);
        expect(route![0].direction).toBe('south');
      }
    }
  });

  it('uses earned physical coordinates when actor and frontier local coordinates exceed 15', async () => {
    const shape = geometry(), actor: Point = [-40, 30], goal: Point = [-40, 37];
    shape.path([actor, [-40, 38]]);
    const f = knowledgeFixture(); await f.observe(shape.sight(actor));
    expect(f.checkpoint().position.cell).toMatchObject({ row: 24, column: 94 });
    const plan = await planLocalExploration(f.pages, f.checkpoint(), 'room');
    expect(plan?.target).toEqual(shape.position(goal)); expect(plan?.route).toHaveLength(7);
    expect(plan?.route.every(step => step.direction === 'east')).toBe(true);
  });
});
