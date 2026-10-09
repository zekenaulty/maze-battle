import { describe, expect, it } from 'vitest';
import type { Direction } from '../types';
import { addressKey, sameAddress } from './address';
import { chooseExplorationDecision } from './exploration';
import { ObservedRoutePlanner, type ObservedRouteContext } from './routePlanner';
import type { CellAddress, ExpeditionCheckpoint, ExplorationDecision, KnownCell, KnownChest, KnownOpening } from './types';

const at = (column = 0, spaceId = 'a', row = 0): CellAddress => ({ spaceId, row, column });
const cell = (position: CellAddress, links: Direction[] = []): KnownCell => ({ ...position, links, observedAt: 0 });
const chest = (id: string, position: CellAddress): KnownChest => ({ ...position, id, opened: false, observedAt: 0 });
const door = (id: string, position: CellAddress, direction: Direction, destination?: CellAddress): KnownOpening => (
  { ...position, id, direction, destination, observedAt: 0 }
);
const control = (): ObservedRouteContext => ({ sessionId: 'runtime', epoch: 0 });

function line(length: number, spaceId = 'a'): KnownCell[] {
  return Array.from({ length }, (_, column) => cell(at(column, spaceId), [
    ...(column ? ['west' as const] : []), ...(column < length - 1 ? ['east' as const] : []),
  ]));
}

function fixture(cells = line(10), openings: KnownOpening[] = [], chests: KnownChest[] = [chest('end', at(9))],
  patch: Partial<ExpeditionCheckpoint> = {}): ExpeditionCheckpoint {
  return { version: 1, worldId: 'observed-only', floorId: 'floor', scopeId: 'finite', revision: 0,
    position: at(), home: at(), openedChestIds: [], phase: 'exploring', moves: 0,
    knowledge: {
      cells: Object.fromEntries(cells.map(value => [addressKey(value), value])),
      openings: Object.fromEntries(openings.map(value => [value.id, value])),
      chests: Object.fromEntries(chests.map(value => [value.id, value])),
    }, ...patch };
}

/** Fake host for already-observed routes only. No topology/generation imports. */
function apply(checkpoint: ExpeditionCheckpoint, decision: ExplorationDecision): ObservedRouteContext['changes'] {
  const changes = { fromRevision: checkpoint.revision, cells: [] as string[], openings: [] as string[], chests: [] as string[] };
  const command = decision.command;
  expect(command, decision.reason).toBeDefined();
  if (!command) throw new Error('No command');
  if (command.type === 'move') {
    const opening = Object.values(checkpoint.knowledge.openings).find(value => sameAddress(value, checkpoint.position) && value.direction === command.direction);
    if (opening) {
      expect(opening.destination).toBeDefined();
      checkpoint.position = { ...opening.destination! };
    } else {
      const current = checkpoint.knowledge.cells[addressKey(checkpoint.position)];
      expect(current.links).toContain(command.direction);
      const [row, column] = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] }[command.direction];
      checkpoint.position = { ...checkpoint.position, row: checkpoint.position.row + row, column: checkpoint.position.column + column };
      expect(checkpoint.knowledge.cells[addressKey(checkpoint.position)]).toBeDefined();
    }
    checkpoint.moves++;
  } else if (command.type === 'collect') {
    const found = Object.values(checkpoint.knowledge.chests).find(value => sameAddress(value, checkpoint.position)
      && !value.opened && !checkpoint.openedChestIds.includes(value.id));
    expect(found).toBeDefined();
    found!.opened = true;
    checkpoint.openedChestIds.push(found!.id);
    changes.chests.push(found!.id);
  } else {
    expect(checkpoint.position).toEqual(checkpoint.home);
    checkpoint.phase = 'complete';
  }
  checkpoint.revision++;
  return changes;
}

function expectBlocked(decision: ExplorationDecision) {
  expect(decision.command).toBeUndefined();
  expect(decision.target).toBeUndefined();
  expect(decision.reason).toMatch(/^Blocked:/);
}

describe('runtime-owned observed route batches', () => {
  it('reuses bounded batches over 6000 known cells without a BFS or whole-map audit per step', () => {
    const checkpoint = fixture(line(6000), [], [chest('end', at(5999))]);
    const planner = new ObservedRoutePlanner({ maxBatchSteps: 128, maxCachedSearchCells: 6500 });
    const context = control();
    for (let step = 0; step < 512; step++) {
      const decision = planner.choose(checkpoint, context);
      expect(decision.command).toEqual({ type: 'move', direction: 'east' });
      expect(decision.target).toEqual(at(5999));
      const { lastWork, cache } = planner.diagnostics;
      expect(cache.batchSteps).toBeLessThanOrEqual(128);
      expect(cache.localSearchCells).toBeLessThanOrEqual(6500);
      if (step % 128 !== 0) {
        expect(lastWork.localCellVisits).toBe(0);
        expect(lastWork.localNodesScanned).toBe(0);
        expect(lastWork.recordsRead).toBe(0);
        expect(lastWork.reusedSteps).toBe(1);
      }
      context.changes = apply(checkpoint, decision);
    }
    expect(planner.diagnostics.work).toMatchObject({
      fullAudits: 1, deltaAudits: 511, graphBuilds: 1, graphBuildRecords: 6001,
      plans: 4, localSearches: 4, localCellVisits: 24000, reusedSteps: 508,
    });
    expect(checkpoint.position).toEqual(at(512));
  });

  it('safely audits ordinary checkpoints, ignoring timestamp/link-order churn and JSON cloning', () => {
    let checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    const context = control();
    const first = planner.choose(checkpoint, context);
    apply(checkpoint, first);
    for (const record of Object.values(checkpoint.knowledge.cells)) { record.observedAt++; record.links.reverse(); }
    checkpoint = JSON.parse(JSON.stringify(checkpoint));
    const second = planner.choose(checkpoint, context);
    expect(second.command).toEqual({ type: 'move', direction: 'east' });
    expect(planner.diagnostics.lastWork).toMatchObject({ fullAudits: 1, graphBuilds: 0, localCellVisits: 0, reusedSteps: 1 });
    expect(new ObservedRoutePlanner().choose(checkpoint, context)).toEqual(second);
    expect(planner.diagnostics.work.localSearches).toBe(1);
  });

  it('invalidates for newly discovered nearby loot, including in-place record edits', () => {
    const checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    apply(checkpoint, planner.choose(checkpoint, control()));
    checkpoint.knowledge.chests.near = chest('near', at(2));
    expect(planner.choose(checkpoint, control()).target).toEqual(at(2));
    expect(planner.diagnostics.lastWork).toMatchObject({ invalidations: 1, graphBuilds: 1, plans: 1, reusedSteps: 0 });
  });

  it('invalidates for new linked frontiers and completed/deleted objectives using complete deltas', () => {
    const checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    const context = control();
    context.changes = apply(checkpoint, planner.choose(checkpoint, context));
    checkpoint.knowledge.cells[addressKey(at(1))].links.push('south');
    context.changes!.cells = [addressKey(at(1))];
    expect(planner.choose(checkpoint, context)).toMatchObject({ command: { type: 'move', direction: 'south' }, target: at(1, 'a', 1) });
    planner.reset();
    checkpoint.knowledge.cells[addressKey(at(1))].links = ['east', 'west'];
    const decision = planner.choose(checkpoint, control());
    context.changes = apply(checkpoint, decision);
    delete checkpoint.knowledge.chests.end;
    context.changes!.chests = ['end'];
    expect(planner.choose(checkpoint, context)).toMatchObject({ command: { type: 'move', direction: 'west' }, target: at() });
  });

  it('clears the objective on confirmed collection and groups the next nearest local chest', () => {
    const checkpoint = fixture(line(5), [], [chest('near', at(1)), chest('far', at(4))]);
    const planner = new ObservedRoutePlanner();
    const context = control();
    let decision = planner.choose(checkpoint, context);
    expect(decision.target).toEqual(at(1));
    context.changes = apply(checkpoint, decision);
    decision = planner.choose(checkpoint, context);
    expect(decision.command).toEqual({ type: 'collect' });
    expect(planner.diagnostics.lastWork.reusedSteps).toBe(1);
    context.changes = apply(checkpoint, decision);
    decision = planner.choose(checkpoint, context);
    expect(decision.target).toEqual(at(4));
    expect(planner.diagnostics.lastWork).toMatchObject({ graphBuilds: 1, plans: 1, reusedSteps: 0 });
  });

  it('prefers space-local objectives rather than claiming globally shortest routes', () => {
    const checkpoint = fixture([...line(12), cell(at(0, 'b'))], [door('shortcut', at(), 'north', at(0, 'b'))], [
      chest('local', at(11)), chest('remote', at(0, 'b')),
    ]);
    expect(new ObservedRoutePlanner().choose(checkpoint, control()).target).toEqual(at(11));
    expect(chooseExplorationDecision(checkpoint).target).toEqual(at(0, 'b'));
  });

  it('reuses a route through learned reciprocal doors, collects and returns home across spaces', () => {
    const checkpoint = fixture([...line(3), ...line(3, 'b')], [
      door('out', at(2), 'north', at(0, 'b')), door('back', at(0, 'b'), 'south', at(2)),
    ], [chest('remote', at(2, 'b'))]);
    const planner = new ObservedRoutePlanner();
    const context = control();
    const commands = [];
    for (let tick = 0; tick < 20 && checkpoint.phase !== 'complete'; tick++) {
      const decision = planner.choose(checkpoint, context);
      commands.push(decision.command);
      if (tick === 2) expect(planner.diagnostics.lastWork).toMatchObject({ reusedSteps: 1, localCellVisits: 0 });
      context.changes = apply(checkpoint, decision);
    }
    expect(commands).toEqual([
      { type: 'move', direction: 'east' }, { type: 'move', direction: 'east' }, { type: 'move', direction: 'north' },
      { type: 'move', direction: 'east' }, { type: 'move', direction: 'east' }, { type: 'collect' },
      { type: 'move', direction: 'west' }, { type: 'move', direction: 'west' }, { type: 'move', direction: 'south' },
      { type: 'move', direction: 'west' }, { type: 'move', direction: 'west' }, { type: 'finish' },
    ]);
    expect(checkpoint.phase).toBe('complete');
    expect(checkpoint.openedChestIds).toEqual(['remote']);
    expect(planner.choose(checkpoint, context).command).toBeUndefined();
    expect(planner.diagnostics.cache.batchSteps).toBe(0);
  });

  it('treats an unlearned doorway as an outward frontier, then learns both ends only from host knowledge', () => {
    const checkpoint = fixture(line(2), [door('out', at(1), 'north')], []);
    const planner = new ObservedRoutePlanner();
    const context = control();
    context.changes = apply(checkpoint, planner.choose(checkpoint, context));
    expect(planner.choose(checkpoint, context)).toMatchObject({ command: { type: 'move', direction: 'north' }, target: at(1) });
    const fromRevision = checkpoint.revision;
    checkpoint.position = at(40, 'b', 20);
    checkpoint.moves++;
    checkpoint.revision++;
    checkpoint.knowledge.cells[addressKey(checkpoint.position)] = cell(checkpoint.position);
    checkpoint.knowledge.openings.out.destination = { ...checkpoint.position };
    checkpoint.knowledge.openings.back = door('back', checkpoint.position, 'south', at(1));
    context.changes = { fromRevision, cells: [addressKey(checkpoint.position)], openings: ['out', 'back'], chests: [] };
    expect(planner.choose(checkpoint, context)).toMatchObject({ command: { type: 'move', direction: 'south' }, target: at() });
    expect(planner.diagnostics.lastWork.graphBuilds).toBe(1);
  });

  it('returns without exploration detours, collecting observed loot on the known return route', () => {
    const checkpoint = fixture(line(6), [door('unknown', at(4), 'north')], [chest('route', at(2)), chest('detour', at(5))],
      { phase: 'returning', position: at(4) });
    const planner = new ObservedRoutePlanner();
    const context = control();
    const commands = [];
    for (let tick = 0; tick < 10 && checkpoint.phase !== 'complete'; tick++) {
      const decision = planner.choose(checkpoint, context);
      commands.push(decision.command);
      context.changes = apply(checkpoint, decision);
    }
    expect(commands).toEqual([
      { type: 'move', direction: 'west' }, { type: 'move', direction: 'west' }, { type: 'collect' },
      { type: 'move', direction: 'west' }, { type: 'move', direction: 'west' }, { type: 'finish' },
    ]);
    expect(checkpoint.openedChestIds).toEqual(['route']);
  });

  it('finishes a fake partially discovered map across frontiers, batches, and planner reloads', () => {
    let checkpoint = fixture(line(3), [door('a-b', at(1), 'north'), door('a-c', at(2), 'north')], []);
    let planner = new ObservedRoutePlanner({ maxBatchSteps: 3 });
    const context = control();
    const arrivals = new Set<string>();
    for (let tick = 0; tick < 60 && checkpoint.phase !== 'complete'; tick++) {
      const decision = planner.choose(checkpoint, context);
      expect(decision.command, decision.reason).toBeDefined();
      if (decision.command?.type === 'finish') {
        expect(checkpoint.position).toEqual(at());
        expect(checkpoint.openedChestIds.slice().sort()).toEqual(['b-near', 'b-end', 'c-end'].sort());
        expect(Object.keys(checkpoint.knowledge.cells)).toHaveLength(8);
        expect(Object.values(checkpoint.knowledge.openings).every(value => value.destination)).toBe(true);
      }
      const direction = decision.command?.type === 'move' ? decision.command.direction : undefined;
      const unresolved = Object.values(checkpoint.knowledge.openings).find(value => sameAddress(value, checkpoint.position)
        && value.direction === direction && !value.destination);
      if (unresolved) {
        // The fake host alone reveals a new space and the learned reciprocal edge after traversal.
        const spaceId = unresolved.id === 'a-b' ? 'b' : 'c';
        expect(arrivals.has(spaceId)).toBe(false);
        arrivals.add(spaceId);
        const fromRevision = checkpoint.revision;
        const from = { ...checkpoint.position };
        checkpoint.position = at(0, spaceId);
        const cells = line(spaceId === 'b' ? 3 : 2, spaceId);
        const chests = spaceId === 'b' ? [chest('b-near', at(1, 'b')), chest('b-end', at(2, 'b'))] : [chest('c-end', at(1, 'c'))];
        for (const value of cells) checkpoint.knowledge.cells[addressKey(value)] = value;
        for (const value of chests) checkpoint.knowledge.chests[value.id] = value;
        unresolved.destination = { ...checkpoint.position };
        const reciprocal = door(`${spaceId}-a`, checkpoint.position, 'south', from);
        checkpoint.knowledge.openings[reciprocal.id] = reciprocal;
        checkpoint.revision++;
        checkpoint.moves++;
        context.changes = { fromRevision, cells: cells.map(addressKey), openings: [unresolved.id, reciprocal.id], chests: chests.map(value => value.id) };
      } else context.changes = apply(checkpoint, decision);
      if (tick % 4 === 3) {
        checkpoint = JSON.parse(JSON.stringify(checkpoint));
        planner = new ObservedRoutePlanner({ maxBatchSteps: 3 });
      }
    }
    expect(checkpoint.phase).toBe('complete');
    expect(checkpoint.moves).toBeLessThan(30);
    expect(arrivals.size).toBe(2);
  });

  it('uses exact local links rather than Manhattan shortcuts through known walls', () => {
    const checkpoint = fixture([
      cell(at(), ['south']), cell(at(0, 'a', 1), ['north', 'east']),
      cell(at(1, 'a', 1), ['west', 'north']), cell(at(1), ['south']),
    ], [], [chest('around-wall', at(1))]);
    const planner = new ObservedRoutePlanner();
    const context = control();
    for (const direction of ['south', 'east', 'north']) {
      const decision = planner.choose(checkpoint, context);
      expect(decision.command).toEqual({ type: 'move', direction });
      context.changes = apply(checkpoint, decision);
    }
    expect(planner.choose(checkpoint, context).command).toEqual({ type: 'collect' });
    expect(planner.diagnostics.work.localSearches).toBe(1);
  });

  it('makes equal-cost port choices independent of record insertion order', () => {
    const checkpoint = fixture([cell(at()), cell(at(0, 'b')), cell(at(0, 'c'))], [
      door('east', at(), 'east', at(0, 'b')), door('north', at(), 'north', at(0, 'c')),
    ], [chest('b', at(0, 'b')), chest('c', at(0, 'c'))]);
    const reversed = structuredClone(checkpoint);
    for (const kind of ['cells', 'openings', 'chests'] as const) {
      Object.assign(reversed.knowledge, { [kind]: Object.fromEntries(Object.entries(checkpoint.knowledge[kind]).reverse()) });
    }
    const decision = new ObservedRoutePlanner().choose(checkpoint, control());
    expect(decision.command).toEqual({ type: 'move', direction: 'north' });
    expect(new ObservedRoutePlanner().choose(reversed, control())).toEqual(decision);
  });

  it('replans when a previously learned destination changes instead of taking cached crossing steps', () => {
    const checkpoint = fixture([...line(3), cell(at(0, 'b')), cell(at(0, 'c'))], [door('out', at(2), 'north', at(0, 'b'))],
      [chest('b', at(0, 'b')), chest('c', at(0, 'c'))]);
    const planner = new ObservedRoutePlanner();
    const context = control();
    context.changes = apply(checkpoint, planner.choose(checkpoint, context));
    checkpoint.knowledge.openings.out.destination = at(0, 'c');
    context.changes!.openings = ['out'];
    expect(planner.choose(checkpoint, context).target).toEqual(at(0, 'c'));
    expect(planner.diagnostics.lastWork).toMatchObject({ graphBuilds: 1, reusedSteps: 0, plans: 1 });
  });

  it.each(['position', 'revision jump', 'revision rollback', 'phase', 'home', 'epoch', 'session'])(
    'replans after %s changes rather than reusing an incompatible batch', (kind) => {
      const checkpoint = fixture();
      const planner = new ObservedRoutePlanner();
      const context = control();
      context.changes = apply(checkpoint, planner.choose(checkpoint, context));
      if (kind === 'position') checkpoint.position = at(4);
      if (kind === 'revision jump') checkpoint.revision += 10;
      if (kind === 'revision rollback') checkpoint.revision = 0;
      if (kind === 'phase') checkpoint.phase = 'returning';
      if (kind === 'home') checkpoint.home = at(5);
      if (kind === 'epoch') context.epoch++;
      if (kind === 'session') context.sessionId = 'new-runtime';
      expect(planner.choose(checkpoint, context).command).toBeDefined();
      expect(planner.diagnostics.lastWork.plans).toBe(1);
      expect(planner.diagnostics.lastWork.reusedSteps).toBe(0);
    },
  );

  it('rejects stale epochs and makes explicit reset discard cached routes', () => {
    const planner = new ObservedRoutePlanner();
    const checkpoint = fixture();
    planner.choose(checkpoint, { ...control(), epoch: 2 });
    expectBlocked(planner.choose(checkpoint, control()));
    planner.reset();
    expect(planner.diagnostics.cache).toEqual({ knowledgeRecords: 0, localSearchCells: 0, localSearches: 0, batchSteps: 0 });
    expect(planner.choose(checkpoint, { ...control(), epoch: 2 }).command).toBeDefined();
  });

  it('falls back to a full knowledge audit for a stale/missing change-set revision', () => {
    const checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    const context = control();
    context.changes = apply(checkpoint, planner.choose(checkpoint, context));
    context.changes!.fromRevision = -1;
    checkpoint.knowledge.chests.near = chest('near', at(2));
    expect(planner.choose(checkpoint, context).target).toEqual(at(2));
    expect(planner.diagnostics.lastWork.fullAudits).toBe(1);
  });

  it('blocks repeated/unacknowledged moves, including advancing revisions with no movement', () => {
    const checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    expect(planner.choose(checkpoint, control()).command).toBeDefined();
    for (let attempt = 0; attempt < 5; attempt++) {
      expectBlocked(planner.choose(checkpoint, control()));
      checkpoint.revision++;
      checkpoint.moves++;
    }
    expect(planner.diagnostics.work.plans).toBe(1);
  });

  it('blocks movement that never resolves its opening frontier instead of cycling through known rooms', () => {
    const checkpoint = fixture([cell(at()), cell(at(0, 'b'))], [
      door('unresolved', at(), 'north'), door('back', at(0, 'b'), 'south', at()),
    ], []);
    const planner = new ObservedRoutePlanner();
    expect(planner.choose(checkpoint, control()).command).toEqual({ type: 'move', direction: 'north' });
    checkpoint.position = at(0, 'b');
    for (let attempt = 0; attempt < 5; attempt++) {
      checkpoint.revision++;
      checkpoint.moves++;
      const decision = planner.choose(checkpoint, control());
      expectBlocked(decision);
      expect(decision.reason).toContain('learned destination');
    }
    checkpoint.knowledge.openings.unresolved.destination = at(0, 'b');
    expect(planner.choose(checkpoint, control()).command).toEqual({ type: 'move', direction: 'south' });
  });

  it.each(['collect', 'finish'] as const)('does not infinitely retry unconfirmed %s commands', (type) => {
    const checkpoint = fixture([cell(at())], [], type === 'collect' ? [chest('here', at())] : []);
    const planner = new ObservedRoutePlanner();
    const decision = planner.choose(checkpoint, control());
    expect(decision.command).toEqual({ type });
    if (type === 'finish') expect(decision.reason).toContain('host validation');
    for (let attempt = 0; attempt < 5; attempt++) {
      checkpoint.revision++;
      expectBlocked(planner.choose(checkpoint, control()));
    }
  });

  it('does not use hidden world properties, infer invisible loot, or synthesize reverse doors', () => {
    const checkpoint = fixture([cell(at()), cell(at(0, 'b'))], [door('one-way', at(), 'north', at(0, 'b'))], [],
      { phase: 'returning', position: at(0, 'b') });
    for (const property of ['plan', 'generation', 'maze', 'chests']) {
      Object.defineProperty(checkpoint, property, { get() { throw new Error('Forbidden hidden graph access'); } });
    }
    const decision = new ObservedRoutePlanner().choose(checkpoint, control());
    expectBlocked(decision);
    expect(decision.reason).toContain('No known route home');
    const home = fixture([cell(at())], [], [], { openedChestIds: ['invisible'] });
    expect(new ObservedRoutePlanner().choose(home, control()).command).toEqual({ type: 'finish' });
  });

  it('does not finish past unreachable known loot or frontiers', () => {
    expectBlocked(new ObservedRoutePlanner().choose(fixture([cell(at()), cell(at(0, 'b'))], [], [chest('remote', at(0, 'b'))]), control()));
    expectBlocked(new ObservedRoutePlanner().choose(fixture([cell(at()), cell(at(0, 'b'), ['east'])], [], []), control()));
  });

  it.each(['knowledge', 'links', 'opening', 'chest', 'position', 'context'])(
    'blocks malformed %s instead of throwing or fabricating a step', (kind) => {
      const checkpoint = fixture();
      const context = control();
      if (kind === 'knowledge') checkpoint.knowledge = null!;
      if (kind === 'links') checkpoint.knowledge.cells[addressKey(at())].links = new Array(1);
      if (kind === 'opening') checkpoint.knowledge.openings.bad = door('bad', at(), 'north', at(0, 'missing'));
      if (kind === 'chest') checkpoint.knowledge.chests.end.id = 'mismatch';
      if (kind === 'position') checkpoint.position.column = NaN;
      if (kind === 'context') context.epoch = -1;
      expectBlocked(new ObservedRoutePlanner().choose(checkpoint, context));
    },
  );

  it('invalidates a changed route edge instead of executing a stale step', () => {
    const checkpoint = fixture();
    const planner = new ObservedRoutePlanner();
    const context = control();
    context.changes = apply(checkpoint, planner.choose(checkpoint, context));
    checkpoint.knowledge.cells[addressKey(at(1))].links = ['west'];
    context.changes!.cells = [addressKey(at(1))];
    expectBlocked(planner.choose(checkpoint, context));
    expect(planner.diagnostics.lastWork.graphBuilds).toBe(1);
  });

  it('bounds knowledge, planning work and retained local trees without an unbounded fallback', () => {
    const checkpoint = fixture(line(20), [], [chest('end', at(19))]);
    expectBlocked(new ObservedRoutePlanner({ maxKnownRecords: 10 }).choose(checkpoint, control()));
    const limited = new ObservedRoutePlanner({ maxPlanningVisits: 5 });
    expectBlocked(limited.choose(checkpoint, control()));
    expect(limited.diagnostics.lastWork.localCellVisits).toBe(5);
    expect(limited.diagnostics.cache.localSearchCells).toBe(0);
    const smallCache = new ObservedRoutePlanner({ maxCachedSearchCells: 5, maxBatchSteps: 3 });
    expect(smallCache.choose(checkpoint, control()).command).toBeDefined();
    expect(smallCache.diagnostics.cache).toMatchObject({ localSearchCells: 0, batchSteps: 3 });
  });

  it('uses a bounded LRU for local port searches and reports a too-small port budget', () => {
    const cells = ['a', 'b', 'c', 'd'].flatMap(space => line(4, space));
    const openings = ['a', 'b', 'c'].flatMap((space, index) => {
      const next = ['b', 'c', 'd'][index];
      return [door(`${space}-out`, at(3, space), 'north', at(0, next)), door(`${next}-back`, at(0, next), 'south', at(3, space))];
    });
    const checkpoint = fixture(cells, openings, [chest('end', at(3, 'd'))]);
    const planner = new ObservedRoutePlanner({ maxCachedSearchCells: 8, maxCachedSearches: 2 });
    expect(planner.choose(checkpoint, control()).target).toEqual(at(3, 'd'));
    expect(planner.diagnostics.cache.localSearchCells).toBeLessThanOrEqual(8);
    expect(planner.diagnostics.cache.localSearches).toBeLessThanOrEqual(2);
    expect(planner.diagnostics.work.localSearches).toBeGreaterThan(2);
    expectBlocked(new ObservedRoutePlanner({ maxPortStates: 1 }).choose(checkpoint, control()));
  });

  it('owns defensive snapshots and does not share mutable cache state between instances', () => {
    const checkpoint = fixture();
    const before = JSON.stringify(checkpoint);
    const first = new ObservedRoutePlanner();
    const second = new ObservedRoutePlanner();
    const decision = first.choose(checkpoint, control());
    const untouched = JSON.parse(JSON.stringify(decision));
    decision.target!.column = 100;
    if (decision.command?.type === 'move') decision.command.direction = 'west';
    first.diagnostics.work.localSearches = 100;
    expect(second.choose(checkpoint, control())).toEqual(untouched);
    expect(JSON.stringify(checkpoint)).toBe(before);
    expect(first.diagnostics.work.localSearches).toBe(1);
    apply(checkpoint, untouched);
    expect(first.choose(checkpoint, control()).command).toEqual({ type: 'move', direction: 'east' });
    expect(first.diagnostics.work.localSearches).toBe(1);
  });
});
