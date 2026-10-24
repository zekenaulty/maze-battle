// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { stageFixture } from './stage.test-support';
import { compileStageScene, seededRandom } from './scene';
import { diskBlocked, slideDisk, StageWalker } from './movement';
import { CELL_SIZE, PLAYER_RADIUS } from './constants';

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
    expect(walker.position).toEqual(held);
    expect(walker.settle(crossing!)).toBe(false); expect(walker.pending).toBeUndefined();
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
