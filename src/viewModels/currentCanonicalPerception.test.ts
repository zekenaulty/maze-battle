import { describe, expect, it } from 'vitest';
import { stageFixture } from '../components/maze3d/stage.test-support';
import { checkpointJson } from '../persistence/canonical/game/checkpoint';
import type { KnowledgeRegionScope } from '../persistence/canonical/knowledge/region';
import { knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import type { ObservedCell } from '../persistence/canonical/knowledge/types';
import { currentCanonicalPerception, type PerceptionFrame, type PerceptionGame } from './currentCanonicalPerception';

const scope: KnowledgeRegionScope = { floor: 1, row: -3, column: -4, rows: 7, columns: 9 };
const coordinates = (region: ReturnType<typeof currentCanonicalPerception>) => region?.cells.map(entry => [entry.cell.world.row, entry.cell.world.column, entry.state]);

async function linkedFrames() {
  const fixture = await stageFixture(), knowledge = knowledgeFixture(), game = fixture.game;
  const publish = async (cells: ObservedCell[]) => {
    game.observation = await knowledge.observe(cells); game.checkpoint = knowledge.checkpoint();
    game.snapshot.checkpoint = checkpointJson(game.checkpoint); game.snapshot.revision++;
    return structuredClone(game);
  };
  const previousGame = await publish(fixture.cells);
  const before: PerceptionFrame = { game: previousGame, region: currentCanonicalPerception(previousGame, scope)! };
  const visible = structuredClone(fixture.cells.slice(1)); delete visible[0].edges.west;
  visible[0].chests = [{ id: 'new-chest', opened: true }];
  const next = await publish(visible);
  return { before, next };
}

describe('immediate canonical perception', () => {
  it('projects published sight and exact cell/edge sources without consulting hidden world data', async () => {
    const { game } = await stageFixture(), captured = structuredClone(game);
    for (const property of ['world', 'maze', 'layout', 'cells']) Object.defineProperty(game, property, { get() { throw new Error(`Hidden read: ${property}`); } });
    const region = currentCanonicalPerception(game, scope)!;
    expect(region.actor).toEqual({ row: 0, column: 0 });
    expect(coordinates(region)).toEqual([[0, 0, 'visible'], [0, 1, 'visible'], [0, 2, 'visible']]);
    region.cells.forEach((entry, index) => {
      const source = { id: game.checkpoint.knowledge!.id, sequence: game.checkpoint.knowledge!.sequence, index };
      expect(entry.cell.source).toEqual(source);
      expect(entry.cell.edges.east).toEqual({ target: game.observation!.cells[index].edges.east, source });
      expect(entry).toMatchObject({ state: 'visible', observation: game.observation!.cells[index] });
    });
    expect({ ...game }).toEqual(captured);
  });

  it('retains directly linked prior sight only as memory and replaces visible facts with current coverage', async () => {
    const { before, next } = await linkedFrames(), captured = structuredClone(before);
    const region = currentCanonicalPerception(next, scope, before)!;
    expect(next.observation!.header.previous).toMatchObject({ id: before.game.checkpoint.knowledge!.id, sequence: before.game.checkpoint.knowledge!.sequence });
    expect(coordinates(region)).toEqual([[0, 0, 'remembered'], [0, 1, 'visible'], [0, 2, 'visible']]);
    expect(region.cells[0]).not.toHaveProperty('observation');
    expect(region.cells[0].cell.source).toEqual(before.region.cells[0].cell.source);
    expect(region.cells[1].cell.chests).toEqual([{ id: 'new-chest', opened: true }]);
    expect(region.cells[1].cell.edges.west).toBeUndefined();
    expect(region.cells[1].cell.edges.east).toEqual({ target: next.observation!.cells[0].edges.east,
      source: { id: next.checkpoint.knowledge!.id, sequence: next.checkpoint.knowledge!.sequence, index: 0 } });
    expect(before).toEqual(captured);
  });

  it('retains earned memory across same-anchor camera changes and clips it to exclusive scope edges', async () => {
    const { before, next } = await linkedFrames();
    const frame: PerceptionFrame = { game: next, region: currentCanonicalPerception(next, scope, before)! };
    const cropped = { ...scope, row: 0, column: 0, rows: 1, columns: 2 };
    const region = currentCanonicalPerception(next, cropped, frame)!;
    expect(coordinates(region)).toEqual([[0, 0, 'remembered'], [0, 1, 'visible']]);
    expect(currentCanonicalPerception(next, { ...cropped, column: 100 }, frame)?.cells).toEqual([]);
  });

  it.each(['fork', 'generation', 'game identity', 'floor', 'same-anchor witness', 'same-anchor knowledge root'] as const)(
    'drops prior memory on a %s mismatch while keeping current sight', async mismatch => {
      const { before, next } = await linkedFrames();
      let previous = before;
      if (mismatch === 'generation') next.snapshot.generation = 'other-generation';
      else if (mismatch === 'game identity') { next.id = 'other-game'; next.snapshot.gameId = next.id; }
      else if (mismatch === 'floor') previous = { ...before, region: { ...before.region, scope: { ...scope, floor: 2 } } };
      else if (mismatch === 'fork') next.observation!.header.previous = { sequence: before.game.checkpoint.knowledge!.sequence, id: 'sibling-head' };
      else {
        previous = { game: structuredClone(next), region: currentCanonicalPerception(next, scope, before)! };
        next.observation!.header.previous = null;
        if (mismatch === 'same-anchor witness') next.checkpoint.knowledge!.witness = 'other-witness';
        else next.snapshot.roots.knowledge = 'other-knowledge-root';
      }
      expect(coordinates(currentCanonicalPerception(next, scope, previous))).toEqual([[0, 1, 'visible'], [0, 2, 'visible']]);
    });

  it.each(['town', 'missing observation', 'missing anchor', 'sequence', 'actor address', 'floor'] as const)(
    'publishes no sight for %s inconsistent with the current checkpoint', async mismatch => {
      const { game } = await stageFixture();
      if (mismatch === 'town') game.checkpoint.mode = 'town';
      else if (mismatch === 'missing observation') game.observation = null;
      else if (mismatch === 'missing anchor') game.checkpoint.knowledge = null;
      else if (mismatch === 'sequence') game.observation!.header.sequence++;
      else if (mismatch === 'actor address') game.checkpoint.position.cell.column++;
      expect(currentCanonicalPerception(game, mismatch === 'floor' ? { ...scope, floor: 2 } : scope)).toBeUndefined();
    });

  it('supports negative world coordinates and never invents unknown cells', async () => {
    const fixture = await stageFixture();
    fixture.cells.forEach(cell => { cell.world.row -= 5; cell.world.column -= 2; });
    const game: PerceptionGame = await fixture.setActor(0), requested = { ...scope, row: -6, column: -3 };
    const region = currentCanonicalPerception(game, requested)!;
    expect(region.actor).toEqual({ row: -5, column: -2 });
    expect(coordinates(region)).toEqual([[-5, -2, 'visible'], [-5, -1, 'visible'], [-5, 0, 'visible']]);
    expect(region.cells).toHaveLength(game.observation!.cells.length);
  });
});
