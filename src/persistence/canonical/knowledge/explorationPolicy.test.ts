// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareExplorationObservation } from './explorationPolicy';
import { comparison, floorCell } from './explorationPolicy.test-support';
import { observationKey } from './keys';
import type { ObservedCell } from './types';

describe('earned exploration material policy', () => {
  it('keeps ordinary discovery, unchanged sight and newly resolved ordinary edges quiet', async () => {
    const actor = floorCell(), next = floorCell(1);
    const linkedActor = { ...actor, edges: { east: next.at } }, linkedNext = { ...next, edges: { west: actor.at } };
    for (const cells of [[actor], [next, actor], [linkedNext, linkedActor]]) {
      const f = await comparison([actor], cells);
      expect(await f.read()).toBeNull(); expect(f.before.writes).toEqual([]);
    }
  });
  it.each(['chest', 'town', 'up', 'down'] as const)('reports new %s with exact future index and does not repeat once remembered', async kind => {
    const actor = floorCell(), poi = floorCell(1);
    if (kind === 'chest') poi.chests = [{ id: 'new-chest', opened: false }]; else poi.stairs = [kind];
    const f = await comparison([actor], [actor, poi]), result = await f.read();
    expect(result).toEqual({ baseline: f.before.checkpoint().knowledge, at: poi.at,
      index: 1, previousSource: null,
      ...(kind === 'chest' ? { reason: 'unopened-chest', chestId: 'new-chest' } : { reason: 'stairs-discovered', stair: kind }) });
    expect(result).not.toHaveProperty('source');
    await f.before.observe([actor, poi]);
    expect(await compareExplorationObservation(f.before.pages, f.before.checkpoint(), f.cells, 'room')).toBeNull();
  });
  it('does not rediscover remembered POIs merely because they reenter sight', async () => {
    const actor = floorCell(), poi = { ...floorCell(1), chests: [{ id: 'known', opened: false }], stairs: ['down'] as const };
    const cells = [actor, { ...poi, stairs: [...poi.stairs] }];
    expect(await (await comparison([actor], cells, cells)).read()).toBeNull();
  });
  it('ignores a newly seen already-open chest and does not infer closure from lost sight', async () => {
    const actor = floorCell(), poi = { ...floorCell(1), chests: [{ id: 'spent', opened: true }] };
    expect(await (await comparison([actor], [actor, poi])).read()).toBeNull();
    expect(await (await comparison([actor, poi], [actor])).read()).toBeNull();
  });
  it.each(['opened', 'reclosed', 'removed'] as const)('reports a remembered chest %s even when it was absent from pre-move sight', async kind => {
    const actor = floorCell(), old = { ...floorCell(1), chests: [{ id: 'known', opened: kind === 'reclosed' }] };
    const next = { ...old, chests: kind === 'removed' ? [] : [{ id: 'known', opened: kind === 'opened' }] };
    const f = await comparison([actor], [actor, next], [actor, old]);
    expect(await f.read()).toEqual({ baseline: f.before.checkpoint().knowledge, at: next.at,
      index: 1, reason: 'chest-changed',
      chestId: 'known', before: kind === 'reclosed', after: kind === 'removed' ? null : kind === 'opened',
      previousSource: { sequence: 1, id: f.before.records.get(observationKey(1))!.id, index: 1 } });
  });
  it.each(['opened', 'blocked'] as const)('reports %s traversability with the original edge source', async kind => {
    const actor = floorCell(), neighbor = floorCell(1);
    const wasOpen = kind !== 'opened';
    const prior = [{ ...actor, edges: { east: wasOpen ? neighbor.at : null } },
      { ...neighbor, edges: wasOpen ? { west: actor.at } : {} }];
    const current: ObservedCell[] = [{ ...actor, edges: { east: kind === 'blocked' ? null : neighbor.at } },
      { ...neighbor, edges: kind === 'blocked' ? {} : { west: actor.at } }];
    const f = await comparison(prior, current), result = await f.read();
    expect(result).toMatchObject({ reason: 'traversability-changed', at: actor.at, direction: 'east',
      before: wasOpen ? neighbor.at : null, after: kind === 'blocked' ? null : neighbor.at,
      previousSource: { sequence: 1, id: f.before.checkpoint().knowledge!.id, index: 0 }, index: 0 });
  });
  it('does not interpret an omitted observed direction as a changed remembered edge', async () => {
    const actor = floorCell(), neighbor = floorCell(1), linked = { ...actor, edges: { east: neighbor.at } };
    expect(await (await comparison([linked, { ...neighbor, edges: { west: actor.at } }], [actor])).read()).toBeNull();
  });
  it('does not overwrite the older edge source when other remembered facts changed later', async () => {
    const actor = floorCell(), old = { ...actor, edges: { east: null } }, neighbor = floorCell(1);
    const f = await comparison([{ ...actor, stairs: ['up'] }],
      [{ ...actor, stairs: ['up'], edges: { east: neighbor.at } }, { ...neighbor, edges: { west: actor.at } }], [old]);
    expect(await f.read()).toMatchObject({ reason: 'traversability-changed', previousSource: { sequence: 1 }, index: 0 });
  });
  it('stops for a newly discovered space, not for remembered neighbors reentering sight', async () => {
    const actor = floorCell(), other = floorCell(1, 'other');
    const f = await comparison([actor], [actor, other]);
    expect(await f.read()).toMatchObject({ reason: 'other-space-visible', at: other.at, index: 1 });
    expect(await (await comparison([actor, other], [actor, other, floorCell(2, 'other')])).read()).toBeNull();
    expect(await (await comparison([actor], [actor, other], [actor, other])).read()).toBeNull();
    expect(await (await comparison([actor], [actor, floorCell(2, 'other')], [actor, other])).read()).toBeNull();
  });
  it('stops on actual entry into another space even if it was already visible', async () => {
    const actor = floorCell(), other = floorCell(1, 'other'), f = await comparison([actor, other], [other, actor]);
    expect(await f.read()).toMatchObject({ reason: 'space-entered', at: other.at, index: 0 });
    expect(await (await comparison([actor], [other, actor], [actor, other])).read())
      .toMatchObject({ reason: 'space-entered', at: other.at, index: 0 });
  });
  it('selects a deterministic public-coordinate reason while preserving its actual observation index', async () => {
    const actor = floorCell(), early = { ...floorCell(1), chests: [{ id: 'early', opened: false }] };
    const late = { ...floorCell(2), chests: [{ id: 'late', opened: false }] };
    const f = await comparison([actor], [actor, late, early]);
    expect(await f.read()).toMatchObject({ reason: 'unopened-chest', chestId: 'early', index: 2 });
  });
  it('prioritizes changed remembered facts over discoveries and actual entry over both', async () => {
    const actor = floorCell(), newChest = { ...floorCell(1), chests: [{ id: 'new', opened: false }] };
    const old = { ...floorCell(8), chests: [{ id: 'known', opened: false }] };
    const changed = { ...old, chests: [{ id: 'known', opened: true }] };
    const f = await comparison([actor, old], [actor, newChest, changed]);
    expect(await f.read()).toMatchObject({ reason: 'chest-changed', chestId: 'known', index: 2 });
    f.cells[0] = floorCell(2, 'other');
    expect(await f.read()).toMatchObject({ reason: 'space-entered', index: 0 });
  });
});
