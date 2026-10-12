import { describe, expect, it } from 'vitest';
import { mergeRpgCell } from '../domain/agentic/knowledge/mergeCell';
import { freeze, sourceOf } from '../domain/agentic/knowledge/shared';
import type { RpgObservation, RpgObservedCell } from '../domain/agentic/knowledge/types';
import type { RpgPerceptionRegion, RpgPerceptionScope } from '../domain/agentic/knowledge/perceptionTypes';
import { currentPerception } from './currentPerception';

const scope: RpgPerceptionScope = { floor: 1, row: 0, column: 0, rows: 3, columns: 6 };
function cell(column: number, extra: Partial<RpgObservedCell> = {}): RpgObservedCell {
  return { address: { floor: 1, row: 0, column }, roomIds: ['hall'], stairs: [],
    chests: [{ id: `chest-${column}`, position: { floor: 1, row: 0, column }, opened: false }],
    links: [], blocked: ['north', 'south'], ...extra };
}
function sight(id: string, revision: number, cells: RpgObservedCell[], gameId = 'perception-game'): RpgObservation {
  return { version: 1, status: 'observed', id, gameId, revision: { owner: 'owner', epoch: 1, revision },
    observedAt: '2026-10-12T00:00:00Z', actor: cells[0].address, policy: { kind: 'rpg-linked-bfs-v1', radius: 2 }, cells };
}
function region(observation: RpgObservation): RpgPerceptionRegion {
  const source = sourceOf(observation);
  return freeze(structuredClone({ kind: 'perception-region', snapshotId: observation.id, source,
    actor: observation.actor, scope, cells: observation.cells.map(observed => ({ state: 'visible',
      observation: observed, fact: mergeRpgCell(undefined, observed, source) })) } as RpgPerceptionRegion));
}

describe('current perception projection', () => {
  it.each([
    { name: 'unproven past', id: 'past', revision: 1, ancestors: [] },
    { name: 'sibling at the same revision', id: 'sibling', revision: 2, ancestors: ['past'] },
    { name: 'future after loading an older save', id: 'future', revision: 99, ancestors: ['past'] },
  ])('drops $name cells and cropped-edge memory without an authenticated ancestor match', ({ id, revision, ancestors }) => {
    const previous = region(sight(id, revision, [cell(0, { links: ['east'] }), cell(1)]));
    const observation = sight('current', 2, [cell(0)]);
    const result = currentPerception(observation, scope, previous, ancestors);
    expect(result.cells.map(c => c.fact.address.column)).toEqual([0]);
    expect(result.cells[0].state).toBe('visible');
    expect(result.cells[0].fact.edges.east).toBeUndefined();
    expect(result.snapshotId).toBe('current');
  });

  it('defaults to no ancestry evidence instead of trusting an older revision or timestamp', () => {
    const previous = region(sight('past', 1, [cell(0)]));
    const observation = sight('current', 99, [cell(1)]);
    expect(currentPerception(observation, scope, previous).cells.map(c => c.fact.address.column)).toEqual([1]);
  });

  it.each(['past', 'current'])('rejects a different game even when snapshot %s matches the ancestry or current head', id => {
    const previous = region(sight(id, 1, [cell(0)], 'different-game'));
    const observation = sight('current', 2, [cell(1)]);
    expect(currentPerception(observation, scope, previous, ['past']).cells.map(c => c.fact.address.column)).toEqual([1]);
  });

  it('retains proven history as memory and updates direct sight without rewriting old facts or cropped edges', () => {
    const previous = region(sight('past', 1, [cell(0), cell(1, { links: ['east', 'west'] }), cell(2)]));
    const before = structuredClone(previous);
    const observed = cell(1, { roomIds: ['changed-room'], stairs: ['down'], blocked: ['north', 'east'],
      chests: [{ id: 'chest-1', position: { floor: 1, row: 0, column: 1 }, opened: true }] });
    const observation = sight('current', 3, [observed]);
    const result = currentPerception(observation, scope, previous, ['immediate-parent', 'past']);
    expect(result.cells.map(c => [c.fact.address.column, c.state, c.fact.source.id])).toEqual([
      [0, 'remembered', 'past'], [1, 'visible', 'current'], [2, 'remembered', 'past'],
    ]);
    expect(result.cells[0]).not.toHaveProperty('observation');
    expect(result.cells[1]).toMatchObject({ observation: observed, fact: {
      roomIds: ['changed-room'], stairs: ['down'], chests: [{ opened: true }],
      edges: { east: { state: 'blocked', source: sourceOf(observation) },
        west: { state: 'open', source: previous.source } },
    } });
    expect(previous).toEqual(before);
    const removed = currentPerception(sight('later', 4, [cell(1, { chests: [], stairs: [], roomIds: [] })]), scope, result, ['current']);
    expect(removed.cells[1].fact).toMatchObject({ chests: [], stairs: [], roomIds: [] });
    expect(result.cells[1].fact.chests[0].opened).toBe(true);
  });

  it('retains same-snapshot historical facts during a scope change without extra ancestry evidence', () => {
    const old = region(sight('past', 1, [cell(0)])), observation = sight('current', 2, [cell(1)]);
    const previous: RpgPerceptionRegion = { ...region(observation), cells: [
      { state: 'remembered', fact: old.cells[0].fact }, ...region(observation).cells,
    ] };
    const result = currentPerception(observation, { ...scope, columns: 2 }, previous);
    expect(result.cells.map(c => [c.state, c.fact.source.id])).toEqual([['remembered', 'past'], ['visible', 'current']]);
  });

  it('clips both sight and retained facts to the requested floor and exclusive rectangle, sorted row then column', () => {
    const at = (row: number, column: number, floor = 1) => cell(column, { address: { floor, row, column }, chests: [] });
    const previous = region(sight('past', 1, [at(1, 2), at(2, 3), at(1, 4), at(3, 2), at(0, 2), at(1, 1), at(1, 2, 2)]));
    const observation = sight('current', 2, [at(2, 2), at(1, 3), at(3, 3), at(2, 4), at(1, 3, 2)]);
    const requested = { floor: 1, row: 1, column: 2, rows: 2, columns: 2 };
    const result = currentPerception(observation, requested, previous, ['past']);
    expect(result.cells.map(c => [c.fact.address.row, c.fact.address.column, c.state])).toEqual([
      [1, 2, 'remembered'], [1, 3, 'visible'], [2, 2, 'visible'], [2, 3, 'remembered'],
    ]);
    expect(result).toMatchObject({ kind: 'perception-region', snapshotId: observation.id,
      actor: observation.actor, source: sourceOf(observation), scope: requested });
    expect(currentPerception(observation, { ...requested, floor: 3 }, previous, ['past']).cells).toEqual([]);
  });

  it('does not invent facts for unknown cells or depend on an actor being inside the requested region', () => {
    const observation = sight('current', 1, [cell(0)]);
    const result = currentPerception(observation, { ...scope, column: 1000, floor: 2 });
    expect(result.cells).toEqual([]);
    expect(result.actor).toEqual(observation.actor);
  });

  it('clips lawful addresses near MAX_SAFE_INTEGER without including the exclusive end', () => {
    const row = Number.MAX_SAFE_INTEGER - 2, column = row;
    const observation = sight('current', 1, [cell(column, { address: { floor: 1, row, column } }),
      cell(column + 1, { address: { floor: 1, row, column: column + 1 } })]);
    const result = currentPerception(observation, { floor: 1, row, column, rows: 1, columns: 1 });
    expect(result.cells.map(c => c.fact.address)).toEqual([{ floor: 1, row, column }]);
  });

  it('accepts deeply frozen inputs without mutating the observation, previous frame, scope or ancestry', () => {
    const input = freeze({ observation: sight('current', 2, [cell(1)]), previous: region(sight('past', 1, [cell(0)])),
      scope: { ...scope }, ancestors: ['past'] });
    const before = structuredClone(input);
    expect(currentPerception(input.observation, input.scope, input.previous, input.ancestors).cells).toHaveLength(2);
    expect(input).toEqual(before);
  });

  it('owns a snapshot unaffected by later mutations of caller-owned sight, scope and remembered facts', () => {
    const observation = sight('current', 2, [cell(1)]), requested = { ...scope };
    const previous = structuredClone(region(sight('past', 1, [cell(0)])));
    const result = currentPerception(observation, requested, previous, ['past']), before = structuredClone(result);
    Object.assign(observation.actor, { column: 4 });
    Object.assign(observation.cells[0].chests[0], { opened: true });
    Object.assign(previous.cells[0].fact.chests[0], { opened: true });
    requested.columns = 1;
    expect(result).toEqual(before);
    expect(Object.isFrozen(observation)).toBe(false);
    expect(Object.isFrozen(previous)).toBe(false);
    expect(Object.isFrozen(requested)).toBe(false);
  });

  it('returns deeply immutable display data, including remembered facts and direct observations', () => {
    const result = currentPerception(sight('current', 2, [cell(1)]), { ...scope }, region(sight('past', 1, [cell(0)])), ['past']);
    const check = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) check(child);
    };
    check(result);
  });
});
