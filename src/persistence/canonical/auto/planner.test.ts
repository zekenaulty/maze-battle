import { describe, expect, it } from 'vitest';
import { autoFixture, at, quest } from './auto.test-support';
import { planAutoRoute, retainObjective } from './planner';
import { saveAutoRoom } from './records';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import { readKnowledgeRoom } from '../knowledge/roomView';
import type { ObservedCell } from '../knowledge/types';

const cell = (column: number, room = 'room') => ({ ...earnedCell(0, column, room, 0, column), chests: [] });
async function view(cells: ObservedCell[]) {
  const knowledge = knowledgeFixture(); await knowledge.observe(cells);
  return { checkpoint: knowledge.checkpoint(), view: await readKnowledgeRoom(knowledge.pages, knowledge.checkpoint()) };
}
describe('bounded host Auto policy', () => {
  it('retains a live objective instead of oscillating and ranks the next objective by shared policy', () => {
    const f = autoFixture(); f.guild.active = [quest('scout', 'room', 'scout')]; retainObjective(f.state, f.guild);
    f.guild.active.push(quest('fetch')); retainObjective(f.state, f.guild); expect(f.state.objective?.id).toBe('scout');
    f.guild.active.shift(); retainObjective(f.state, f.guild); expect(f.state.objective?.id).toBe('fetch');
  });
  it('compares nearby loot with a learned quest waypoint using real path distance', async () => {
    const f = autoFixture(), a = cell(0), b = cell(1), c = cell(2, 'child');
    a.edges.east = b.at; b.edges.west = a.at; b.edges.east = c.at; c.edges.west = b.at;
    const sight = await view([a, { ...b, chests: [{ id: 'loot', opened: false }] }, c]);
    f.guild.active = [quest('fetch', 'child')]; retainObjective(f.state, f.guild); f.state.lastPosition = a.at;
    await saveAutoRoom(f.pages, f.room);
    await saveAutoRoom(f.pages, { ...f.room, spaceId: 'child', depth: 1, parent: { from: c.at, to: b.at, direction: 'west' } });
    await planAutoRoute(f.pages, sight.checkpoint, f.state, f.room, sight.view, f.guild);
    expect(f.state.route?.target).toEqual(c.at); expect(f.state.route?.steps).toHaveLength(2);
    expect(f.state.objective?.id).toBe('fetch');
  });
  it('persists only a 64-step local route window, not a complete room path', async () => {
    const f = autoFixture(), cells: ObservedCell[] = [];
    for (let row = 0; row < 10; row++) for (let n = 0; n < 10; n++) {
      const column = row % 2 ? 9 - n : n;
      cells.push({ ...earnedCell(row, column, 'room', row, column), chests: [] });
    }
    for (let n = 1; n < cells.length; n++) {
      const previous = cells[n - 1], next = cells[n];
      if (previous.world.row !== next.world.row) { previous.edges.south = next.at; next.edges.north = previous.at; }
      else if (previous.world.column < next.world.column) { previous.edges.east = next.at; next.edges.west = previous.at; }
      else { previous.edges.west = next.at; next.edges.east = previous.at; }
    }
    cells.at(-1)!.chests = [{ id: 'far-loot', opened: false }];
    const sight = await view(cells); f.state.lastPosition = cells[0].at;
    await planAutoRoute(f.pages, sight.checkpoint, f.state, f.room, sight.view, f.guild);
    expect(f.state.route?.steps).toHaveLength(64); expect(f.state.route?.target).toEqual(cells.at(-1)!.at);
    expect(f.state.route?.steps.at(-1)?.to).toEqual(cells[64].at);
  });
  it('stops for unresolved sight instead of inventing a route toward a hidden guild target', async () => {
    const f = autoFixture(), a = cell(0); delete a.edges.north; const sight = await view([a]);
    f.guild.active = [quest('fetch', 'hidden')]; retainObjective(f.state, f.guild);
    await expect(planAutoRoute(f.pages, sight.checkpoint, f.state, f.room, sight.view, f.guild)).rejects.toThrow('further observation');
    expect(f.state.route).toBeNull(); expect(f.room.closed).toBe(false);
  });
  it('marks earned exploration complete but reports remaining combat rather than descending', async () => {
    const f = autoFixture(), sight = await view([cell(0)]); f.guild.combatRequired = true; f.state.descent = at('room');
    await expect(planAutoRoute(f.pages, sight.checkpoint, f.state, f.room, sight.view, f.guild)).rejects.toThrow('combat-required');
    expect(f.state.completed).toBe(true); expect(f.state.objective).toBeNull();
  });
});
