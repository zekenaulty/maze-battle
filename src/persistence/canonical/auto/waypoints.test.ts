import { describe, expect, it } from 'vitest';
import { autoFixture, at } from './auto.test-support';
import { saveAutoRoom, loadAutoRoom } from './records';
import { currentAutoRoom, objectiveHop, recordAutoCrossing } from './waypoints';
import { earnedCell } from '../knowledge/region.test-support';

describe('learned Auto room waypoints', () => {
  it('resolves deep objectives in bounded, reloadable ancestry windows', async () => {
    const f = autoFixture(); await saveAutoRoom(f.pages, f.room);
    for (let depth = 1; depth <= 20; depth++) await saveAutoRoom(f.pages, { ...f.room, spaceId: `child-${depth}`, depth,
      parent: { from: at(`child-${depth}`), to: at(depth === 1 ? 'room' : `child-${depth - 1}`), direction: 'west' } });
    f.state.objective = { id: 'quest', roomId: 'child-20', kind: 'quest' };
    expect(await objectiveHop(f.pages, f.state, f.room)).toBe('pending'); expect(f.reads).toHaveLength(8);
    const resumed = structuredClone(f.state); f.reads.length = 0;
    expect(await objectiveHop(f.pages, resumed, f.room)).toBe('pending'); expect(f.reads).toHaveLength(8);
    f.reads.length = 0;
    expect(await objectiveHop(f.pages, resumed, f.room)).toBe('child-1'); expect(f.reads.length).toBeLessThanOrEqual(8);
    expect(resumed.search).toBeNull();
  });
  it('does not invent a path to a guild-named room, and rejects nondecreasing ancestry', async () => {
    const f = autoFixture(); f.state.objective = { id: 'q', roomId: 'hidden', kind: 'quest' };
    expect(await objectiveHop(f.pages, f.state, f.room)).toBeNull();
    await saveAutoRoom(f.pages, { ...f.room, spaceId: 'hidden', depth: 3, parent: { from: at('hidden'), to: at('other'), direction: 'west' } });
    await saveAutoRoom(f.pages, { ...f.room, spaceId: 'other', depth: 3, parent: { from: at('other'), to: at('hidden'), direction: 'west' } });
    await expect(objectiveHop(f.pages, f.state, f.room)).rejects.toThrow('ancestry is not decreasing');
  });
  it('records a child only after observed reciprocal crossing and marks it complete on real backtracking', async () => {
    const f = autoFixture(); await currentAutoRoom(f.pages, f.state);
    const step = { from: at('room'), to: at('child'), direction: 'east' as const }, child = earnedCell(-5, -1, 'child');
    await expect(recordAutoCrossing(f.pages, f.state, f.room, step, [child])).rejects.toThrow('observed return edge');
    expect(await loadAutoRoom(f.pages, f.state, 'child')).toBeNull();
    child.edges.west = step.from; await recordAutoCrossing(f.pages, f.state, f.room, step, [child]);
    const saved = (await loadAutoRoom(f.pages, f.state, 'child'))!; expect(saved.parent?.to).toEqual(step.from);
    saved.closed = true; const parent = earnedCell(); parent.edges.east = step.to;
    await recordAutoCrossing(f.pages, f.state, saved, saved.parent!, [parent]);
    expect((await loadAutoRoom(f.pages, f.state, 'room'))?.completed).toEqual(['child']);
  });
});
