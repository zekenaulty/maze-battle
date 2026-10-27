// @vitest-environment node
import { expect, it } from 'vitest';
import { stageFixture } from './stage.test-support';
import { compileStageScene } from './scene';
import { spatialBinding } from '../../services/game/SpatialView';

it('omits unrequested furnishings while retaining explicit shelving and the identical walls, doors and decks', async () => {
  const { game } = await stageFixture();
  let old = compileStageScene(game)!;
  for (let offset = 1; offset <= 32 && !old.boxes.some(b => b.material === 'bookshelf'); offset++) {
    game.observation!.cells.forEach(c => { c.world.row = offset; });
    old = compileStageScene(game)!;
  }
  expect(old.boxes.some(b => b.material === 'bookshelf')).toBe(true);
  game.observation!.header.spaces!.forEach(s => { s.furnishing = 'none'; });
  const before = structuredClone(game), empty = compileStageScene(game)!;
  expect(empty.boxes.some(b => b.material === 'bookshelf')).toBe(false);
  expect(empty.boxes).toEqual(old.boxes.filter(b => b.material !== 'bookshelf'));
  expect(empty.doors).toEqual(old.doors); expect(game).toEqual(before);
  game.observation!.header.spaces!.forEach(s => { s.furnishing = 'wall-shelving-v1'; });
  expect(compileStageScene(game)!.boxes).toEqual(old.boxes);
});

it('keeps structural stair-room furnishing policy when the actor observation replaces its cell', async () => {
  const { game, cells } = await stageFixture();
  game.spatial = { version: 'stair-room-sight-v2', binding: spatialBinding(game.snapshot), frame: [0, 0, 0], prepareDown: false,
    rooms: [{ id: 'known-room', spaceId: cells[0].at.cell.spaceId, level: 1, frame: [0, 0, 0], kind: 'room', furnishing: 'none', cells: cells.slice(0, 2), voids: [] }] };
  const scene = compileStageScene(game)!;
  expect(scene.cells.filter(c => c.kind === 'room').every(c => c.furnishing === 'none')).toBe(true);
  expect(scene.boxes.some(b => b.material === 'bookshelf')).toBe(false);
});
