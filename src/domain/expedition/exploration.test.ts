import { describe, expect, it } from 'vitest';
import type { Direction } from '../types';
import { addressKey } from './address';
import { chooseExplorationDecision } from './exploration';
import type { CellAddress, ExpeditionCheckpoint, KnownCell, KnownChest, KnownOpening } from './types';

const at = (spaceId = 'a', column = 0, row = 0): CellAddress => ({ spaceId, row, column });
const cell = (position: CellAddress, links: Direction[] = []): KnownCell => ({ ...position, links, observedAt: 1 });
const chest = (id: string, position: CellAddress, opened = false): KnownChest => ({ ...position, id, opened, observedAt: 1 });
const opening = (id: string, position: CellAddress, direction: Direction, destination?: CellAddress): KnownOpening => (
  { ...position, id, direction, destination, observedAt: 1 }
);

function fixture(
  cells: KnownCell[], openings: KnownOpening[] = [], chests: KnownChest[] = [],
  overrides: Partial<ExpeditionCheckpoint> = {},
): ExpeditionCheckpoint {
  return {
    version: 1, worldId: 'fake', floorId: 'floor', scopeId: 'finite-test', revision: 0,
    position: at(), home: at(), openedChestIds: [], phase: 'exploring', moves: 0,
    knowledge: {
      cells: Object.fromEntries(cells.map((value) => [addressKey(value), value])),
      openings: Object.fromEntries(openings.map((value) => [value.id, value])),
      chests: Object.fromEntries(chests.map((value) => [value.id, value])),
    },
    ...overrides,
  };
}

function line(length: number, spaceId = 'a'): KnownCell[] {
  return Array.from({ length }, (_, column) => cell(at(spaceId, column), [
    ...(column > 0 ? ['west' as const] : []), ...(column < length - 1 ? ['east' as const] : []),
  ]));
}

function expectBlocked(checkpoint: ExpeditionCheckpoint) {
  const decision = chooseExplorationDecision(checkpoint);
  expect(decision.command).toBeUndefined();
  expect(decision.target).toBeUndefined();
  expect(decision.reason).toMatch(/^Blocked:/);
}

describe('observation-only exploration', () => {
  it('crosses an unknown opening using its outward direction, without inventing a destination', () => {
    const checkpoint = fixture([cell(at())], [opening('door', at(), 'north')]);
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'north' }, target: at(), reason: expect.stringContaining('Traverse'),
    });
    expect(checkpoint.knowledge.openings.door.destination).toBeUndefined();
  });

  it('treats only linked missing local cells as frontiers, not arbitrary unseen neighbors', () => {
    expect(chooseExplorationDecision(fixture([cell(at(), ['east'])]))).toMatchObject({
      command: { type: 'move', direction: 'east' }, target: at('a', 1),
    });
    const closed = fixture([cell(at())]);
    expect(chooseExplorationDecision(closed)).toMatchObject({
      command: { type: 'finish' }, reason: expect.stringContaining('host validation'),
    });
    expect(closed.phase).toBe('exploring');
  });

  it('navigates to a doorway waypoint and then takes the outward step instead of oscillating', () => {
    const checkpoint = fixture(line(3), [opening('door', at('a', 2), 'south')]);
    for (let column = 0; column <= 2; column++) {
      checkpoint.position = at('a', column);
      expect(chooseExplorationDecision(checkpoint)).toMatchObject({
        command: { type: 'move', direction: column === 2 ? 'south' : 'east' }, target: at('a', 2),
      });
    }
  });

  it('advances a local frontier monotonically as the host observes cells', () => {
    const checkpoint = fixture([cell(at(), ['east'])]);
    for (let column = 0; column < 5; column++) {
      expect(chooseExplorationDecision(checkpoint)).toMatchObject({
        command: { type: 'move', direction: 'east' }, target: at('a', column + 1),
      });
      checkpoint.position = at('a', column + 1);
      checkpoint.knowledge.cells[addressKey(checkpoint.position)] = cell(checkpoint.position,
        column === 4 ? ['west'] : ['east', 'west']);
    }
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'west' }, target: at(),
    });
  });

  it('prioritizes the nearest discovered loot and collects it while approaching a farther objective', () => {
    const checkpoint = fixture(line(6), [opening('exit', at('a', 5), 'east')], [
      chest('far', at('a', 4)), chest('near', at('a', 1)),
    ]);
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'east' }, target: at('a', 1),
    });
    checkpoint.position = at('a', 1);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'collect' });
    checkpoint.openedChestIds.push('near');
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'east' }, target: at('a', 4),
    });
    checkpoint.knowledge.chests.far.opened = true;
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'east' }, target: at('a', 5),
    });
  });

  it('prefers loot on distance ties, but does not abandon a nearby frontier for distant loot', () => {
    const checkpoint = fixture(line(5), [opening('door', at(), 'north')], [chest('loot', at('a', 1))]);
    expect(chooseExplorationDecision(checkpoint).target).toEqual(at('a', 1));
    checkpoint.knowledge.chests.loot = chest('loot', at('a', 4));
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'north' }, target: at(),
    });
  });

  it('routes across reciprocal learned doors using their directions, not coordinate differences', () => {
    const destination = at('b', 20, 10);
    const checkpoint = fixture([...line(2), cell(destination)], [
      opening('a-to-b', at('a', 1), 'north', destination),
      opening('b-to-a', destination, 'west', at('a', 1)),
    ], [chest('loot', destination)]);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'move', direction: 'east' });
    checkpoint.position = at('a', 1);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'move', direction: 'north' });
    checkpoint.position = destination;
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'collect' });
    checkpoint.openedChestIds = ['loot'];
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'west' }, target: at(),
    });
    checkpoint.position = at('a', 1);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'move', direction: 'west' });
    checkpoint.position = at();
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'finish' });
  });

  it('does not infer a reverse cross-space edge or pair unlearned doors by id or coordinates', () => {
    const destination = at('b');
    expectBlocked(fixture([cell(at()), cell(destination)], [opening('forward', at(), 'east', destination)], [], {
      position: destination, phase: 'returning',
    }));
    expectBlocked(fixture([cell(at()), cell(destination)], [
      opening('forward', at(), 'east'), opening('reverse', destination, 'west'),
    ], [], { position: destination, phase: 'returning' }));
  });

  it('returns home without frontier or loot detours in returning phase, collecting only en route', () => {
    const checkpoint = fixture(line(5), [opening('door', at('a', 2), 'south')], [
      chest('on-route', at('a', 1)), chest('detour', at('a', 4)),
    ], { position: at('a', 2), phase: 'returning' });
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'west' }, target: at(),
    });
    checkpoint.position = at('a', 1);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'collect' });
    checkpoint.openedChestIds = ['on-route'];
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'move', direction: 'west' });
    checkpoint.position = at();
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'finish' }, reason: expect.stringContaining('host validation'),
    });
  });

  it('makes an already completed checkpoint a no-op even with leftover observed targets', () => {
    const checkpoint = fixture([cell(at(), ['east'])], [], [chest('loot', at())], { phase: 'complete' });
    expect(chooseExplorationDecision(checkpoint)).toEqual({ reason: 'Expedition already complete.' });
  });

  it('makes identical decisions after JSON reload, without mutation or hidden per-run state', () => {
    const checkpoint = fixture(line(4), [opening('door', at('a', 3), 'south')], [chest('loot', at('a', 2))]);
    const before = JSON.stringify(checkpoint);
    const decision = chooseExplorationDecision(checkpoint);
    chooseExplorationDecision(fixture([cell(at())], [], [], { phase: 'returning' }));
    expect(chooseExplorationDecision(JSON.parse(before))).toEqual(decision);
    expect(JSON.stringify(checkpoint)).toBe(before);
    decision.target!.column = 99;
    expect(JSON.stringify(checkpoint)).toBe(before);
  });

  it('breaks equal-route ties independently of cell, opening, and chest insertion order', () => {
    const origin = at('a', 1, 1);
    const north = at('a', 1, 0);
    const east = at('a', 2, 1);
    const cells = [cell(origin, ['east', 'north']), cell(north, ['south']), cell(east, ['west'])];
    const doors = [opening('east', east, 'east'), opening('north', north, 'north')];
    const chests = [chest('east', east), chest('north', north)];
    const options = { position: origin, home: origin };
    const a = fixture(cells, doors, chests, options);
    const b = fixture([...cells].reverse(), [...doors].reverse(), [...chests].reverse(), options);
    expect(chooseExplorationDecision(a)).toEqual(chooseExplorationDecision(b));
    expect(chooseExplorationDecision(a).command).toEqual({ type: 'move', direction: 'north' });
    a.openedChestIds = b.openedChestIds = ['east', 'north'];
    expect(chooseExplorationDecision(a)).toEqual(chooseExplorationDecision(b));
  });

  it('does not claim invisible loot from opened ids or unrelated checkpoint data', () => {
    const checkpoint = fixture([cell(at())], [], [], { openedChestIds: ['unobserved'] });
    Object.defineProperty(checkpoint, 'plan', { get: () => { throw new Error('Forbidden world access'); } });
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({ command: { type: 'finish' } });
  });

  it('blocks disconnected discovered loot and frontiers instead of declaring completion at home', () => {
    expectBlocked(fixture([cell(at()), cell(at('b'))], [], [chest('unreachable', at('b'))]));
    expectBlocked(fixture([cell(at()), cell(at('b'), ['east'])]));
    expectBlocked(fixture([cell(at()), cell(at('b'))], [opening('unreachable', at('b'), 'east')]));
  });

  it('can explore a reachable frontier before declaring other known work unreachable', () => {
    const checkpoint = fixture([cell(at(), ['east']), cell(at('b'))], [], [chest('unreachable', at('b'))]);
    expect(chooseExplorationDecision(checkpoint).command).toEqual({ type: 'move', direction: 'east' });
  });

  it('blocks when the home route is unknown and does not fabricate a move or finish away from home', () => {
    expectBlocked(fixture([cell(at()), cell(at('b'))], [], [], { position: at('b') }));
    expectBlocked(fixture([cell(at())], [], [], { home: at('missing') }));
    expectBlocked(fixture([cell(at())], [], [], { position: at('missing') }));
  });

  it.each([
    ['empty', {}], ['null', null], ['array', []],
    ['missing records', { cells: {} }],
    ['empty records', { cells: {}, openings: {}, chests: {} }],
    ['wrong cell key', { cells: { wrong: cell(at()) }, openings: {}, chests: {} }],
    ['null cell', { cells: { [addressKey(at())]: null }, openings: {}, chests: {} }],
  ])('blocks %s knowledge without throwing', (_, knowledge) => {
    expectBlocked({ ...fixture([cell(at())]), knowledge } as ExpeditionCheckpoint);
  });

  it.each([
    ['invalid direction', { links: ['up'] }], ['duplicate links', { links: ['east', 'east'] }],
    ['sparse links', { links: new Array(1) }],
    ['non-array links', { links: {} }], ['non-finite timestamp', { observedAt: NaN }],
    ['invalid coordinate', { row: -1 }], ['unsafe coordinate', { column: Number.MAX_SAFE_INTEGER + 1 }],
    ['out of range link', { links: ['north'] }],
  ])('blocks cells with %s', (_, patch) => {
    const checkpoint = fixture([cell(at())]);
    Object.assign(checkpoint.knowledge.cells[addressKey(at())], patch);
    expectBlocked(checkpoint);
  });

  it.each([
    ['mismatched id', { id: 'other' }], ['invalid direction', { direction: 'up' }],
    ['null destination', { destination: null }], ['missing destination cell', { destination: at('missing') }],
    ['self destination', { destination: at() }], ['missing source cell', { spaceId: 'missing' }],
  ])('blocks openings with %s', (_, patch) => {
    const checkpoint = fixture([cell(at())], [opening('door', at(), 'north')]);
    Object.assign(checkpoint.knowledge.openings.door, patch);
    expectBlocked(checkpoint);
  });

  it('blocks ambiguous local/opening directions and duplicate opening directions', () => {
    expectBlocked(fixture([cell(at(), ['east'])], [opening('door', at(), 'east')]));
    expectBlocked(fixture([cell(at())], [opening('one', at(), 'north'), opening('two', at(), 'north')]));
  });

  it.each([
    ['mismatched id', { id: 'other' }], ['missing observed cell', { spaceId: 'missing' }],
    ['non-boolean opened', { opened: 'false' }], ['invalid timestamp', { observedAt: Infinity }],
  ])('blocks chests with %s without fabricating collection', (_, patch) => {
    const checkpoint = fixture([cell(at())], [], [chest('loot', at())]);
    Object.assign(checkpoint.knowledge.chests.loot, patch);
    expectBlocked(checkpoint);
  });

  it.each([null, { version: 0 }, { phase: 'unknown' }, { openedChestIds: null },
    { openedChestIds: [1] }, { openedChestIds: new Array(1) }, { home: null }, { position: null }])(
    'blocks invalid checkpoint data %j', (patch) => {
      const checkpoint = patch === null ? null : { ...fixture([cell(at())]), ...patch };
      expectBlocked(checkpoint as ExpeditionCheckpoint);
    },
  );

  it('exhausts a finite branched, cyclic observed map with reloads and loot revealed only on arrival', () => {
    const remote = at('b', 10, 10);
    const remoteEnd = at('b', 11, 10);
    const spur = at('c', 5, 8);
    // Fake host records stay outside the checkpoint. Only observe/traverse exposes them.
    const cells = [
      cell(at(), ['east', 'south']), cell(at('a', 1), ['west', 'south']),
      cell(at('a', 0, 1), ['north', 'east']), cell(at('a', 1, 1), ['north', 'west']),
      cell(remote, ['east']), cell(remoteEnd, ['west']), cell(spur),
    ];
    const portals = [
      { id: 'a-b', source: at('a', 1), direction: 'north' as const, destination: remote },
      { id: 'b-a', source: remote, direction: 'south' as const, destination: at('a', 1) },
      { id: 'a-c', source: at('a', 0, 1), direction: 'west' as const, destination: spur },
      { id: 'c-a', source: spur, direction: 'east' as const, destination: at('a', 0, 1) },
    ];
    const loot = [chest('b-entry', remote), chest('b-end', remoteEnd), chest('c-end', spur)];
    const collected = new Set<string>();
    const crossed = new Set<string>();
    let checkpoint = fixture([]);
    function observe() {
      const key = addressKey(checkpoint.position);
      const current = cells.find((value) => addressKey(value) === key)!;
      checkpoint.knowledge.cells[key] = { ...current, links: [...current.links] };
      for (const portal of portals.filter((value) => addressKey(value.source) === key)) {
        checkpoint.knowledge.openings[portal.id] ??= opening(portal.id, portal.source, portal.direction);
      }
      for (const value of loot.filter((value) => addressKey(value) === key)) {
        checkpoint.knowledge.chests[value.id] = { ...value, opened: collected.has(value.id) };
      }
    }
    observe();
    expect(Object.keys(checkpoint.knowledge.chests)).toHaveLength(0);
    let finished = false;
    for (let tick = 0; tick < 60; tick++) {
      const decision = chooseExplorationDecision(checkpoint);
      expect(decision.command, decision.reason).toBeDefined();
      if (!decision.command) break;
      if (decision.command.type === 'finish') {
        // Only the fake host, not the planner, can validate this finite scope.
        expect(checkpoint.position).toEqual(checkpoint.home);
        expect(collected.size).toBe(loot.length);
        expect(Object.keys(checkpoint.knowledge.cells)).toHaveLength(cells.length);
        expect(crossed.size).toBe(portals.length);
        expect(checkpoint.phase).toBe('exploring');
        checkpoint.phase = 'complete';
        expect(chooseExplorationDecision(checkpoint).command).toBeUndefined();
        finished = true;
        break;
      }
      if (decision.command.type === 'collect') {
        const found = Object.values(checkpoint.knowledge.chests).find((value) => !collected.has(value.id)
          && addressKey(value) === addressKey(checkpoint.position));
        expect(found).toBeDefined();
        collected.add(found!.id);
        checkpoint.openedChestIds.push(found!.id);
        observe();
      } else {
        const direction = decision.command.direction;
        const portal = portals.find((value) => addressKey(value.source) === addressKey(checkpoint.position)
          && value.direction === direction);
        if (portal) {
          crossed.add(portal.id);
          checkpoint.knowledge.openings[portal.id].destination = { ...portal.destination };
          checkpoint.position = { ...portal.destination };
        } else {
          const current = checkpoint.knowledge.cells[addressKey(checkpoint.position)];
          expect(current.links).toContain(direction);
          const delta = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] }[direction];
          checkpoint.position = {
            ...checkpoint.position, row: checkpoint.position.row + delta[0], column: checkpoint.position.column + delta[1],
          };
        }
        checkpoint.moves++;
        observe();
      }
      checkpoint.revision++;
      const resumed = JSON.parse(JSON.stringify(checkpoint)) as ExpeditionCheckpoint;
      expect(chooseExplorationDecision(resumed)).toEqual(chooseExplorationDecision(checkpoint));
      checkpoint = resumed;
    }
    expect(finished).toBe(true);
    expect(checkpoint.moves).toBeLessThan(40);
  });

  it('handles thousands of observed cells iteratively and keeps only the next step and waypoint', () => {
    const checkpoint = fixture(line(6000), [], [chest('end', at('a', 5999))]);
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'east' }, target: at('a', 5999),
    });
    checkpoint.position = at('a', 5999);
    checkpoint.openedChestIds = ['end'];
    expect(chooseExplorationDecision(checkpoint)).toMatchObject({
      command: { type: 'move', direction: 'west' }, target: at(),
    });
  });
});
