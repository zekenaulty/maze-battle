import { describe, expect, it } from 'vitest';
import { STAIR_RECIPE } from '../../domain/expedition/vertical';
import { AutoWalkPresentation, followAngle, MAX_AUTO_LEGS } from './AutoWalkPresentation';
import { addressKey, compileStageScene, type StageConnector, type StageScene } from './scene';
import { stageFixture } from './stage.test-support';

async function routeFixture(count = 3) {
  const { game } = await stageFixture(), original = compileStageScene(game)!;
  const cells = Array.from({ length: count }, (_, i) => {
    const source = structuredClone(original.actor.source);
    source.at = { level: 1, cell: { spaceId: 'room', row: i < 2 ? 1 : 0, column: i === 0 ? 0 : Math.max(1, i - 1) } };
    source.edges = {};
    return { ...original.actor, source, key: addressKey(source.at), center: { x: i === 0 ? 0 : (i - 1 || 1) * 3.2, z: i < 2 ? 0 : -3.2 } };
  });
  for (let i = 0; i < count - 1; i++) {
    const direction = i === 1 ? 'north' : 'east'; cells[i].source.edges[direction] = cells[i + 1].source.at;
  }
  const scenes = cells.map(actor => ({ ...original, cells, actor }));
  const walk = new AutoWalkPresentation(scenes[0]); walk.update(scenes[0], scenes[0], true, 0, 500);
  return { scenes, walk };
}
const advance = (walk: AutoWalkPresentation, seconds: number, hz = 60) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) walk.advance(1 / hz);
};

describe('accepted Auto movement presentation', () => {
  it('interpolates only accepted neighbours, ignores stationary publications and waits without inventing a next move', async () => {
    const { scenes: [a, b], walk } = await routeFixture(), saved = structuredClone(b);
    walk.advance(.05); expect(walk.moving).toBe(false);
    walk.update(a, b, true, .5, 500); expect(walk.pose.x).toBe(0);
    advance(walk, .2); expect(walk.pose.x).toBeGreaterThan(0); expect(walk.pose.x).toBeLessThan(3.2);
    const before = { ...walk.pose }; walk.update(b, b, true, .8, 500);
    expect(walk.pose).toEqual(before); expect(walk.queued).toBe(1);
    advance(walk, 2); expect(walk.pose).toEqual({ x: 3.2, y: 0, z: 0 }); expect(walk.queued).toBe(0);
    walk.advance(.05); expect(walk.moving).toBe(false); expect(b).toEqual(saved);
  });

  it.each([30, 60, 144])('keeps buffered orthogonal bends at %s Hz without restarting or cutting the corner', async hz => {
    const { scenes: [a, b, c], walk } = await routeFixture();
    walk.update(a, b, true, .5, 500); advance(walk, .2, hz); walk.update(b, c, true, 1, 500);
    let moving = 0;
    for (let i = 0; i < hz * 3; i++) {
      const old = { ...walk.pose }; walk.advance(1 / hz);
      expect(walk.pose.x >= 0 && walk.pose.x <= 3.2).toBe(true);
      expect(walk.pose.z >= -3.2 && walk.pose.z <= 0).toBe(true);
      expect(walk.pose.z === 0 || Math.abs(walk.pose.x - 3.2) < 1e-8).toBe(true);
      expect(Math.hypot(walk.pose.x - old.x, walk.pose.z - old.z)).toBeLessThan(.5);
      if (walk.moving) moving++;
    }
    expect(moving).toBeGreaterThan(hz / 2); expect(walk.pose).toEqual({ x: 3.2, y: 0, z: -3.2 });
    expect(walk.heading).toBeCloseTo(0);
  });

  it.each(['stop', 'scope', 'relocation', 'undisclosed'] as const)('discards obsolete replay on %s and settles the canonical actor before manual input', async reason => {
    const { scenes: [a, b, c], walk } = await routeFixture(); walk.update(a, b, true, .5, 500); advance(walk, .2);
    const next: StageScene = structuredClone(c);
    if (reason === 'scope') next.scope = 'another-generation';
    if (reason === 'relocation') { next.actor.center.x += 30; }
    if (reason === 'undisclosed') next.cells = [next.actor];
    walk.update(b, next, reason !== 'stop', 1, 500);
    expect(walk.pose).toEqual({ ...next.actor.center, y: next.actor.floorY }); expect(walk.queued).toBe(0);
    expect(walk.moving).toBe(false); expect(walk.heading).toBeUndefined();
  });

  it('bounds backlog at fast Auto settings instead of accumulating an unbounded stale route', async () => {
    const { scenes, walk } = await routeFixture(16);
    // A disclosed straight strip for this stress case.
    scenes.forEach((s, i) => { s.actor.center = { x: i * 3.2, z: 0 };
      if (scenes[i + 1]) s.actor.source.edges = { east: scenes[i + 1].actor.source.at }; });
    for (let i = 1; i < scenes.length; i++) {
      walk.update(scenes[i - 1], scenes[i], true, i * .016, 0);
      expect(walk.queued).toBeLessThanOrEqual(MAX_AUTO_LEGS);
      expect(Object.values(walk.pose).every(Number.isFinite)).toBe(true);
    }
    advance(walk, 5); expect(walk.pose.x).toBeCloseTo(15 * 3.2); expect(walk.queued).toBe(0);
  });

  it('drops a retained leg when a stationary publication withdraws its geometry', async () => {
    const { scenes: [a, b], walk } = await routeFixture(); walk.update(a, b, true, .5, 500); advance(walk, .2);
    walk.update(b, { ...b, cells: [b.actor] }, true, .7, 500);
    expect(walk.queued).toBe(0); expect(walk.pose.x).toBe(3.2);
  });
});

describe('Auto stair and camera presentation', () => {
  it.each(['down', 'up'])('uses the real flat landings and ramp when replaying an accepted %s transition', async direction => {
    const { scenes: [upper] } = await routeFixture();
    const at = { level: 2, cell: { spaceId: 'lower', row: 4, column: 4 } };
    const lower: StageScene = { ...upper, level: 2, actor: { ...upper.actor, key: addressKey(at),
      source: { ...upper.actor.source, at }, center: { x: 0, z: -STAIR_RECIPE.separation }, floorY: -STAIR_RECIPE.rise } };
    const connector: StageConnector = { binding: 'fixture', upper: { x: 0, y: 0, z: 0 }, lower: { ...lower.actor.center, y: lower.actor.floorY },
      sight: { id: 'placed-stair', upper: upper.actor.source.at, lower: at, upperPoint: { row: 0, column: 0 }, lowerPoint: { row: 4, column: 4 },
        targetFrame: [0, -4.68, 0], placement: { version: 'straight-stair-placement-v1', recipe: 'straight-stair-v1', upperFrame: [0, 0, 0], lowerFrame: [0, -4.68, 0] }, cells: [] } };
    upper.connectors = lower.connectors = [connector]; upper.cells = lower.cells = [upper.actor, lower.actor];
    const [a, b] = direction === 'down' ? [upper, lower] : [lower, upper];
    const walk = new AutoWalkPresentation(a); walk.update(a, a, true, 0, 500); walk.update(a, b, true, .5, 500);
    expect(walk.pose.y).toBe(a.actor.floorY);
    let ramp = 0, landing = 0;
    for (let i = 0; i < 600 && walk.queued; i++) {
      const before = walk.pose.y; walk.advance(1 / 120);
      const run = -walk.pose.z, slope = Math.max(0, Math.min(1, (run - .9) / (STAIR_RECIPE.steps * STAIR_RECIPE.tread)));
      expect(walk.pose.y).toBeCloseTo(-slope * STAIR_RECIPE.rise, 7);
      expect(Math.abs(walk.pose.y - before)).toBeLessThan(.12);
      if (slope > 0 && slope < 1) ramp++; else landing++;
    }
    expect(ramp).toBeGreaterThan(20); expect(landing).toBeGreaterThan(5);
    expect(walk.pose).toEqual({ ...b.actor.center, y: b.actor.floorY });
    expect(walk.pitch).toBe(0); walk.advance(.05); expect(walk.pitch).toBe(0);
  });

  it('steers across the angle wrap by the short arc and bounds reversal speed', () => {
    let yaw = Math.PI - .02;
    const next = followAngle(yaw, -Math.PI + .02, .016);
    expect(next).toBeGreaterThan(yaw); expect(next - yaw).toBeLessThan(.02);
    yaw = 0;
    for (let i = 0; i < 180; i++) { const next = followAngle(yaw, Math.PI, 1 / 60); expect(Math.abs(next - yaw)).toBeLessThanOrEqual(Math.PI / 60 + 1e-8); yaw = next; }
    expect(yaw).toBeCloseTo(Math.PI, 6); expect(followAngle(yaw, 0, 0)).toBe(yaw);
  });
});
