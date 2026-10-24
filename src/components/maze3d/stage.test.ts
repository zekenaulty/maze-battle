// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { stageFixture } from './stage.test-support';
import { compileStageScene, directionVector, seededRandom } from './scene';
import { diskBlocked, PREDICTION_LIMIT, slideDisk, StageWalker } from './movement';
import { CELL_SIZE, PLAYER_RADIUS, WALK_SPEED } from './constants';
import { earnedCell, knowledgeFixture } from '../../persistence/canonical/knowledge/region.test-support';
import { exploreView } from '../ExploreScreen.test-support';
import { checkpointJson } from '../../persistence/canonical/game/checkpoint';

describe('canonical stage disclosure and seeded scene compilation', () => {
  it('replays scene data independently of observation order/revision and never consumes Math.random', async () => {
    const { game } = await stageFixture(), before = structuredClone(game), a = compileStageScene(game)!;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Unseeded visual generation'); });
    const b = compileStageScene({ ...game, snapshot: { ...game.snapshot, revision: 999 }, observation: { ...game.observation!, cells: [...game.observation!.cells].reverse() } });
    random.mockRestore(); expect(b).toEqual(a); expect(game).toEqual(before);
    const r1 = seededRandom(42), r2 = seededRandom(42), r3 = seededRandom(43);
    expect(Array.from({ length: 10 }, r1)).toEqual(Array.from({ length: 10 }, r2));
    expect(r2()).not.toBe(r3());
  });
  it('keeps unknown edges opaque and solid and never invents undisclosed floor cells', async () => {
    const { game, cells, setActor } = await stageFixture(); delete cells[0].edges.north; await setActor(0);
    const scene = compileStageScene(game)!;
    expect(scene.cells).toHaveLength(3); expect(scene.boxes.some(b => b.material === 'unknown')).toBe(true);
    expect(diskBlocked({ x: 0, z: -CELL_SIZE / 2 }, scene.colliders)).toBe(true);
    const stale = structuredClone(game); stale.observation!.header.sequence++;
    expect(compileStageScene(stale)).toBeUndefined(); expect(compileStageScene({ ...game, observation: null })).toBeUndefined();
  });
  it('opens room interiors and leaves a collision-accurate doorway between canonical spaces', async () => {
    const { game } = await stageFixture(), scene = compileStageScene(game)!;
    expect(diskBlocked({ x: CELL_SIZE / 2, z: 0 }, scene.colliders)).toBe(false);
    expect(diskBlocked({ x: CELL_SIZE * 1.5, z: 0 }, scene.colliders)).toBe(false);
    expect(diskBlocked({ x: CELL_SIZE * 1.5, z: 1.2 }, scene.colliders)).toBe(true);
    for (const box of scene.boxes.filter(b => b.material === 'bookshelf')) expect(box.solid).toBe(true);
  });
  it('faces seeded shelves into the room on all four wall orientations', async () => {
    const game = exploreView(), fixture = knowledgeFixture(), covered = new Set<string>();
    for (let row = 0; row < 32 && covered.size < 4; row++) {
      const cell = earnedCell(row, 0, 'library'); cell.chests = [];
      game.observation = await fixture.observe([cell], { graph: 'available', spaces: [{ spaceId: 'library', kind: 'room', index: 0 }] });
      game.checkpoint = fixture.checkpoint(); game.snapshot.checkpoint = checkpointJson(game.checkpoint);
      const scene = compileStageScene(game)!;
      for (const shelf of scene.boxes.filter(box => box.material === 'bookshelf')) {
        expect(shelf.facing).toBeDefined();
        const normal = directionVector[shelf.facing!];
        expect((scene.actor.center.x - shelf.center[0]) * normal.x + (scene.actor.center.z - shelf.center[2]) * normal.z).toBeGreaterThan(0);
        covered.add(shelf.facing!);
      }
    }
    expect([...covered].sort()).toEqual(['east', 'north', 'south', 'west']);
  });
});
describe('planar capsule traversal and canonical crossing custody', () => {
  it('sweeps against thin walls, slides along them and prevents corner cutting', () => {
    const wall = { minX: 1, maxX: 1.12, minZ: -2, maxZ: 4 };
    const end = slideDisk({ x: 0, z: 0 }, { x: 6, z: 2 }, [wall]);
    expect(end.x).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 0.001); expect(end.z).toBeCloseTo(2);
    expect(diskBlocked(end, [wall])).toBe(false);
    const corner = slideDisk({ x: 0, z: 0 }, { x: 2, z: 2 }, [wall, { minX: -2, maxX: 4, minZ: 1, maxZ: 1.12 }]);
    expect(corner.x).toBeLessThan(1); expect(corner.z).toBeLessThan(1);
  });
  it('allows local motion with no command and only one pending request at a boundary', async () => {
    const { game } = await stageFixture(), walker = new StageWalker(compileStageScene(game)!);
    for (let i = 0; i < 10; i++) expect(walker.advance(0.016, 0, 1, 0)).toBeUndefined();
    expect(walker.position.x).toBeGreaterThan(0.5);
    let crossing; for (let i = 0; i < 100 && !crossing; i++) crossing = walker.advance(0.016, 0, 1, 0);
    expect(crossing?.direction).toBe('east'); const held = { ...walker.position };
    for (let i = 0; i < 100; i++) expect(walker.advance(0.05, 0, 1, 0)).toBeUndefined();
    expect(walker.position.x).toBeGreaterThan(held.x);
    expect(walker.position.x).toBeCloseTo(CELL_SIZE / 2 + PREDICTION_LIMIT);
    expect(walker.scene.actor.center.x).toBe(0);
    expect(walker.settle(crossing!)).toBe(false); expect(walker.pending).toBeUndefined();
    expect(walker.position.x).toBeLessThan(CELL_SIZE / 2);
  });
  it.each([25, 100, 250])('predicts only one disclosed neighbour during a %i ms commit', async delay => {
    const { game, setActor } = await stageFixture(), before = structuredClone(game), walker = new StageWalker(compileStageScene(game)!);
    let crossing; while (!crossing) crossing = walker.advance(0.016, 0, 1, 0);
    const x = walker.position.x;
    for (let elapsed = 0; elapsed < delay; elapsed += 5) expect(walker.advance(0.005, 0, 1, 0)).toBeUndefined();
    expect(walker.position.x - x).toBeCloseTo(Math.min(delay / 1000 * WALK_SPEED, CELL_SIZE / 2 + PREDICTION_LIMIT - x));
    expect(game).toEqual(before); // Presentation never changes checkpoint, sight, inventory or saves.
    const predicted = { ...walker.position };
    walker.update(compileStageScene(await setActor(1), walker.scene.origin)!);
    expect(walker.position).toEqual(predicted);
    expect(walker.settle(crossing)).toBe(true); expect(walker.position).toEqual(predicted);
    walker.advance(0.016, 0, 1, 0);
    expect(walker.position.x - predicted.x).toBeCloseTo(WALK_SPEED * 0.016);
  });
  it('anchors pending bounds to the original cell even after accepted props publish', async () => {
    const { game, setActor } = await stageFixture(), walker = new StageWalker(compileStageScene(game)!);
    let crossing; while (!crossing) crossing = walker.advance(0.016, 0, 1, 0);
    walker.update(compileStageScene(await setActor(1), walker.scene.origin)!);
    for (let i = 0; i < 200; i++) expect(walker.advance(0.05, 0, 1, 0)).toBeUndefined();
    expect(walker.position.x).toBeCloseTo(CELL_SIZE / 2 + PREDICTION_LIMIT);
    expect(walker.settle(crossing)).toBe(true);
  });
  it('keeps reversal inside the admitted neighbour until settlement, without automatic return commands', async () => {
    const { game, setActor } = await stageFixture(), walker = new StageWalker(compileStageScene(game)!);
    let crossing; while (!crossing) crossing = walker.advance(0.016, 0, 1, 0);
    for (let i = 0; i < 10; i++) walker.advance(0.016, 0, 1, 0);
    for (let i = 0; i < 100; i++) expect(walker.advance(0.016, 0, -1, 0)).toBeUndefined();
    expect(walker.position.x).toBeGreaterThan(CELL_SIZE / 2);
    walker.update(compileStageScene(await setActor(1), walker.scene.origin)!); walker.settle(crossing);
    expect(walker.advance(0.016, 0, 0, 0)).toBeUndefined();
    expect(walker.advance(0.016, 0, 1, 0)).toBeUndefined();
    expect(walker.advance(0.05, 0, -1, 0)?.direction).toBe('west');
  });
  it('sweeps prediction against props, bounds diagonal motion and rolls back only the active refusal', async () => {
    const { game, setActor } = await stageFixture(), scene = compileStageScene(game)!, walker = new StageWalker(scene);
    scene.colliders.push({ minX: 2.1, maxX: 2.3, minZ: -0.8, maxZ: 0.8 });
    let crossing; while (!crossing) crossing = walker.advance(0.016, 0, 1, 0);
    for (let i = 0; i < 100; i++) walker.advance(0.05, -1, 1, 0);
    expect(walker.position.x).toBeLessThanOrEqual(CELL_SIZE / 2 + PREDICTION_LIMIT);
    expect(walker.position.z).toBeLessThan(CELL_SIZE / 2);
    expect(diskBlocked(walker.position, scene.colliders)).toBe(false);
    walker.reject(crossing); expect(walker.position).toEqual(crossing.sourcePosition);
    while (!walker.pending) walker.advance(0.016, 0, 1, 0);
    const stale = walker.pending!;
    walker.update(compileStageScene(await setActor(2), scene.origin)!);
    const relocated = { ...walker.position };
    walker.reject(stale); expect(walker.settle(stale)).toBe(false);
    expect(walker.position).toEqual(relocated); expect(walker.pending).toBeUndefined();
  });
  it('admits no crossing when a constrained diagonal entry is stopped by a corner prop', async () => {
    const { game, cells, setActor } = await stageFixture();
    const south = earnedCell(1, 0, 'library', 1, 0), southeast = earnedCell(1, 1, 'library', 1, 1);
    south.chests = []; southeast.chests = [];
    cells[0].edges.south = south.at; south.edges.north = cells[0].at;
    cells[1].edges.south = southeast.at; southeast.edges.north = cells[1].at;
    south.edges.east = southeast.at; southeast.edges.west = south.at;
    cells.push(south, southeast); await setActor(0);
    const scene = compileStageScene(game)!, walker = new StageWalker(scene);
    scene.colliders.push({ minX: 1.85, maxX: 2.1, minZ: 0.8, maxZ: 1.3 });
    walker.position = { x: 1.535, z: 1.54 };
    expect(diskBlocked(walker.position, scene.colliders)).toBe(false);
    // The unrestricted diagonal can clear the prop by entering the southern cell first.
    // Restricting prediction to the east neighbour must not authorize that same route.
    expect(slideDisk(walker.position, { x: 0.19 / Math.SQRT2, z: 0.19 / Math.SQRT2 }, scene.colliders).x).toBeGreaterThan(CELL_SIZE / 2);
    expect(walker.advance(0.05, -1, 1, 0)).toBeUndefined();
    expect(walker.pending).toBeUndefined();
    expect(walker.position.x).toBeLessThanOrEqual(CELL_SIZE / 2);
    expect(diskBlocked(walker.position, scene.colliders)).toBe(false);
  });
  it('adopts committed local and cross-space addresses without jumping to cell centers', async () => {
    const { game, setActor } = await stageFixture(), walker = new StageWalker(compileStageScene(game)!);
    for (const target of [1, 2]) {
      let crossing; for (let i = 0; i < 150 && !crossing; i++) crossing = walker.advance(0.016, 0, 1, 0);
      const x = walker.position.x;
      walker.update(compileStageScene(await setActor(target), { row: 0, column: 0 })!);
      expect(walker.settle(crossing!)).toBe(true); expect(walker.position.x - x).toBeLessThan(0.02);
    }
    expect(walker.scene.actor.source.at.cell.spaceId).toBe('passage');
    const other = await setActor(0); walker.update(compileStageScene(other, { row: 0, column: 0 })!);
    expect(walker.position).toEqual({ x: 0, z: 0 });
  });
  it('does not walk across a confirmed outer wall even with a long frame gap', async () => {
    const { game } = await stageFixture(), walker = new StageWalker(compileStageScene(game)!);
    for (let i = 0; i < 120; i++) expect(walker.advance(30, 1, 0, 0)).toBeUndefined();
    expect(walker.position.z).toBeGreaterThan(-CELL_SIZE / 2); expect(walker.pending).toBeUndefined();
  });
});
