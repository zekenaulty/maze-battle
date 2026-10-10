// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addressKey } from '../address';
import { StreamPlanner, STREAM_PLANNER_LIMITS } from './planner';
import { applyLocal, at, chooseInput, control, fixture, stamp, type Fixture } from './planner.testSupport';
import type { StreamCheckpoint, StreamKnowledgePage } from './types';

const choose = (planner: StreamPlanner, f: Fixture) => planner.choose(...chooseInput(f));

describe('observed room-local streaming planner', () => {
  it('groups nearest local loot before an internal frontier, pending door or child exit', () => {
    const f = fixture(5, [2, 4]);
    f.page.cells[addressKey(at(4))].links.push('east');
    f.page.frontiers.pending = { ...at(0), id: 'pending', direction: 'north', observedAt: 0 };
    f.page.openings.child = { ...at(0), id: 'child', direction: 'south', observedAt: 0 };
    const planner = new StreamPlanner();
    const commands = [];
    for (let count = 0; count < 6; count++) {
      const decision = choose(planner, f);
      expect(decision.command, decision.reason).toBeDefined();
      commands.push(decision.command);
      applyLocal(f, decision.command!);
    }
    expect(commands.map(command => command!.type)).toEqual(['move', 'move', 'collect', 'move', 'move', 'collect']);
    expect(planner.diagnostics.work.plans).toBe(1);
    expect(planner.diagnostics.work.searches).toBe(2);
    expect(planner.diagnostics.work.reusedSteps).toBe(5);
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'east' });
  });

  it('uses only an observed link for an unknown cell, then does not oscillate back', () => {
    const f = fixture(1);
    f.page.cells[addressKey(at(0))].links = ['east'];
    const planner = new StreamPlanner();
    const next = choose(planner, f);
    expect(next.command).toEqual({ type: 'move', direction: 'east' });
    expect(next.target).toEqual(at(1));
    applyLocal(f, next.command!);
    f.page.cells[addressKey(at(1))] = { ...at(1), links: ['west', 'east'], observedAt: 1 };
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'east' });
  });

  it('prepares a pending doorway before visiting known child openings', () => {
    const f = fixture(3);
    f.page.frontiers.pending = { ...at(2), id: 'pending', direction: 'east', observedAt: 0 };
    f.page.openings.child = { ...at(0), id: 'child', direction: 'west', observedAt: 0 };
    const planner = new StreamPlanner();
    for (let count = 0; count < 2; count++) {
      const decision = choose(planner, f);
      expect(decision.command).toEqual({ type: 'move', direction: 'east' });
      applyLocal(f, decision.command!);
    }
    expect(choose(planner, f).command).toEqual({ type: 'prepare', frontierId: 'pending' });
  });

  it.each(['both', 'topology', 'game'] as const)('accepts %s revision progress without moving while the requested door stays pending', progress => {
    const f = fixture(1);
    f.page.frontiers.pending = { ...at(0), id: 'pending', direction: 'east', observedAt: 0 };
    const planner = new StreamPlanner();
    for (let count = 0; count < 20; count++) {
      expect(choose(planner, f).command).toEqual({ type: 'prepare', frontierId: 'pending' });
      if (progress !== 'topology') f.checkpoint.revision++;
      if (progress !== 'game') f.checkpoint.topologyRevision++;
      stamp(f);
    }
    expect(f.checkpoint.position).toEqual(at(0));
    expect(f.checkpoint.moves).toBe(0);
    expect(planner.diagnostics.cache.batchSteps).toBe(1);
  });

  it('moves through a committed observed opening only after preparation replaces the frontier', () => {
    const f = fixture(1);
    f.page.frontiers.pending = { ...at(0), id: 'pending', direction: 'east', observedAt: 0 };
    const planner = new StreamPlanner();
    applyLocal(f, choose(planner, f).command!);
    delete f.page.frontiers.pending;
    f.page.openings.door = { ...at(0), id: 'door', direction: 'east', observedAt: 1 };
    const decision = choose(planner, f);
    expect(decision.command).toEqual({ type: 'move', direction: 'east' });
    expect(decision.target).toEqual(at(0)); // No fabricated cross-space destination.
  });

  it('skips cleared child exits, backtracks through the learned parent, then finishes at entry', () => {
    const f = fixture(1);
    const planner = new StreamPlanner();
    f.page.openings.child = { ...at(0), id: 'child', direction: 'east', observedAt: 0 };
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'east' });
    f.checkpoint.position = at(0, 'child');
    f.checkpoint.revision++;
    f.checkpoint.moves++;
    f.page = { version: 1, spaceId: 'child', revision: 1, cells: {
      [addressKey(at(0, 'child'))]: { ...at(0, 'child'), links: [], observedAt: 1 },
    }, chests: {}, openings: { parent: { ...at(0, 'child'), id: 'parent', direction: 'west', destination: at(0), observedAt: 1 } },
    parentOpeningId: 'parent', frontiers: {}, completedExits: [], cleared: false };
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'west' });
    f.checkpoint.position = at(0);
    f.checkpoint.revision++;
    f.checkpoint.moves++;
    f.page = fixture(1).page;
    f.page.openings.child = { ...at(0), id: 'child', direction: 'east', destination: at(0, 'child'), observedAt: 2 };
    f.page.completedExits = ['child'];
    stamp(f);
    expect(choose(planner, f).command).toEqual({ type: 'finish' });
  });

  it('blocks a crossing with no learned reciprocal port in the arrival page', () => {
    const f = fixture(1);
    f.page.openings.child = { ...at(0), id: 'child', direction: 'east', destination: at(0, 'child'), observedAt: 0 };
    const planner = new StreamPlanner();
    choose(planner, f);
    f.checkpoint.revision++;
    f.checkpoint.moves++;
    f.checkpoint.position = at(0, 'child');
    f.page = { version: 1, spaceId: 'child', revision: 1, cells: {
      [addressKey(at(0, 'child'))]: { ...at(0, 'child'), links: [], observedAt: 1 },
    }, chests: {}, openings: { parent: { ...at(0, 'child'), id: 'parent', direction: 'west', destination: at(1), observedAt: 1 } },
    parentOpeningId: 'parent', frontiers: {}, completedExits: [], cleared: false };
    const decision = choose(planner, f);
    expect(decision.command).toBeUndefined();
    expect(decision.reason).toMatch(/reciprocal/);
  });

  it('returns to the home cell and asks the host to validate completion', () => {
    const f = fixture(3);
    f.checkpoint.position = at(2);
    const planner = new StreamPlanner();
    for (let count = 0; count < 2; count++) {
      const decision = choose(planner, f);
      expect(decision.command).toEqual({ type: 'move', direction: 'west' });
      applyLocal(f, decision.command!);
    }
    expect(choose(planner, f).command).toEqual({ type: 'finish' });
    f.checkpoint.revision++;
    expect(choose(planner, f).command).toBeUndefined();
    f.checkpoint.phase = 'complete';
    expect(choose(planner, f).command).toBeUndefined();
    expect(planner.diagnostics.cache.pages).toBe(0);
  });

  it('does not read a page or issue any command when complete', () => {
    const f = fixture();
    f.checkpoint.phase = 'complete';
    const page = new Proxy(f.page, { get() { throw new Error('Page must not be read.'); } });
    const planner = new StreamPlanner();
    expect(planner.choose(f.checkpoint, page, control).reason).toMatch(/already complete/);
    expect(planner.diagnostics.lastWork.auditedRecords).toBe(0);
  });

  it('invalidates on newly observed nearby loot, including in-place page edits', () => {
    const f = fixture(5, [4]);
    const planner = new StreamPlanner();
    applyLocal(f, planner.choose(f.checkpoint, f.page, control).command!);
    f.page.chests.nearby = { ...at(1), id: 'nearby', opened: false, observedAt: 1 };
    expect(planner.choose(f.checkpoint, f.page, control).command).toEqual({ type: 'collect' });
    expect(planner.diagnostics.lastWork.invalidations).toBe(1);
  });

  it('replans when a chest objective is completed externally or movement deviates', () => {
    const f = fixture(5, [4]);
    const planner = new StreamPlanner();
    applyLocal(f, choose(planner, f).command!);
    f.page.chests['loot-4'].opened = true;
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'west' });
    f.checkpoint.position = at(3);
    f.checkpoint.revision++;
    f.checkpoint.moves++;
    stamp(f);
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'west' });
    expect(planner.diagnostics.lastWork.plans).toBe(1);
  });

  it('produces the same fresh decision after cloning/reload without a hidden world cache', () => {
    const f = fixture(8, [7]);
    const planner = new StreamPlanner();
    for (let count = 0; count < 3; count++) applyLocal(f, choose(planner, f).command!);
    const reloaded = new StreamPlanner();
    expect(choose(planner, f)).toEqual(choose(reloaded, f));
    expect(planner.diagnostics.lastWork.searches).toBe(0);
    expect(reloaded.diagnostics.lastWork.searches).toBe(1);
  });

  it('rejects stale and competing tokens without losing the current owner batch', () => {
    const f = fixture(5, [4]);
    const planner = new StreamPlanner();
    applyLocal(f, choose(planner, f).command!);
    expect(planner.choose(f.checkpoint, f.page, { sessionId: 'old-owner', epoch: 0 }).command).toBeUndefined();
    expect(planner.choose(f.checkpoint, f.page, { sessionId: 'competing', epoch: 1 }).command).toBeUndefined();
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'east' });
    expect(planner.diagnostics.lastWork.reusedSteps).toBe(1);
    expect(planner.choose(f.checkpoint, f.page, { sessionId: 'new-owner', epoch: 2 }).command).toEqual({ type: 'move', direction: 'east' });
    expect(planner.diagnostics.lastWork.plans).toBe(1);
    expect(planner.choose(f.checkpoint, f.page, control).command).toBeUndefined();
  });

  it.each(['move', 'collect', 'prepare', 'finish'] as const)('never repeats an unconfirmed %s indefinitely', kind => {
    const f = fixture(kind === 'move' ? 2 : 1, kind === 'collect' ? [0] : kind === 'move' ? [1] : []);
    if (kind === 'prepare') f.page.frontiers.pending = { ...at(0), id: 'pending', direction: 'east', observedAt: 0 };
    const planner = new StreamPlanner();
    expect(choose(planner, f).command?.type).toBe(kind);
    for (let count = 0; count < 10; count++) expect(choose(planner, f).command).toBeUndefined();
    expect(planner.diagnostics.work.plans).toBe(1);
    planner.reset();
    expect(choose(planner, f).command?.type).toBe(kind);
  });

  it.each(['move', 'collect'] as const)('does not accept revision-only progress for an ineffective %s', kind => {
    const f = fixture(kind === 'move' ? 2 : 1, kind === 'move' ? [1] : [0]);
    const planner = new StreamPlanner();
    expect(choose(planner, f).command?.type).toBe(kind);
    for (let count = 0; count < 10; count++) {
      f.checkpoint.revision++;
      stamp(f);
      expect(choose(planner, f).command).toBeUndefined();
    }
  });

  it('retains its pending fence through a corrupt page and rejects checkpoint rollback', () => {
    const f = fixture(3, [2]);
    const planner = new StreamPlanner();
    const first = choose(planner, f);
    expect(planner.choose(f.checkpoint, {} as StreamKnowledgePage, control).command).toBeUndefined();
    expect(choose(planner, f).command).toBeUndefined();
    applyLocal(f, first.command!);
    expect(choose(planner, f).command?.type).toBe('move');
    f.checkpoint.revision = 0;
    expect(choose(planner, f).reason).toMatch(/stale checkpoint/);
  });

  it('never reads root/topology/room geometry or extra checkpoint properties', () => {
    const f = fixture(3, [2]);
    for (const value of [f.checkpoint, f.page]) {
      for (const key of ['root', 'topology', 'room', 'geometry', 'plan', 'maze', 'children']) {
        Object.defineProperty(value, key, { get() { throw new Error(`Forbidden ${key}`); } });
      }
    }
    expect(new StreamPlanner().choose(f.checkpoint, f.page, control).command).toEqual({ type: 'move', direction: 'east' });
  });

  it('keeps returned decisions and diagnostics detached from internal cache state', () => {
    const f = fixture(3, [2]);
    const planner = new StreamPlanner();
    const decision = choose(planner, f);
    if (decision.command?.type === 'move') decision.command.direction = 'west';
    decision.target!.column = 99;
    const diagnostics = planner.diagnostics;
    diagnostics.work.plans = 99;
    diagnostics.cache.cells = 99;
    applyLocal(f, { type: 'move', direction: 'east' });
    expect(choose(planner, f).command).toEqual({ type: 'move', direction: 'east' });
    expect(planner.diagnostics.work.plans).toBe(1);
    expect(planner.diagnostics.cache.cells).toBe(3);
  });
});

describe('streaming planner bounds and invalid observations', () => {
  it('reuses four bounded batches across 511 moves on a 512-cell page', () => {
    const f = fixture(512, [511]);
    const planner = new StreamPlanner();
    for (let count = 0; count < 511; count++) {
      const decision = choose(planner, f);
      expect(decision.command).toEqual({ type: 'move', direction: 'east' });
      expect(planner.diagnostics.cache).toMatchObject({ pages: 1, cells: 512 });
      expect(planner.diagnostics.cache.batchSteps).toBeLessThanOrEqual(128);
      expect(planner.diagnostics.lastWork.expandedCells).toBeLessThanOrEqual(512);
      applyLocal(f, decision.command!);
    }
    expect(choose(planner, f).command).toEqual({ type: 'collect' });
    expect(planner.diagnostics.work.plans).toBe(4);
    expect(planner.diagnostics.work.expandedCells).toBe(4 * 512);
    expect(planner.diagnostics.work.reusedSteps).toBe(508);
    expect(planner.diagnostics.lastWork.auditedRecords).toBe(513);
  });

  it('bounds nearest-chest grouping work to eight local searches', () => {
    const f = fixture(512, Array.from({ length: 512 }, (_, i) => i));
    f.page.openings.north = { ...at(0), id: 'north', direction: 'north', observedAt: 0 };
    f.page.openings.south = { ...at(0), id: 'south', direction: 'south', observedAt: 0 };
    f.page.openings.west = { ...at(0), id: 'west', direction: 'west', observedAt: 0 };
    f.page.openings.east = { ...at(511), id: 'east', direction: 'east', observedAt: 0 };
    const planner = new StreamPlanner();
    expect(choose(planner, f).command).toEqual({ type: 'collect' });
    expect(planner.diagnostics.lastWork.searches).toBe(STREAM_PLANNER_LIMITS.chestObjectives);
    expect(planner.diagnostics.lastWork.expandedCells).toBe(8 * 512);
    expect(planner.diagnostics.lastWork.examinedLinks).toBeLessThanOrEqual(8 * 4 * 512);
    expect(planner.diagnostics.lastWork.auditedRecords).toBe(512 + 512 + 4);
    expect(planner.diagnostics.cache).toEqual({ pages: 1, cells: 512, chests: 512, ports: 4, batchSteps: 15 });
  });

  it('bounds memory across 2000 paged spaces and backtracks without a hidden ancestor stack', () => {
    const depth = 2000;
    const f = fixture(1);
    const planner = new StreamPlanner();
    const space = (index: number) => index ? `room-${index}` : 'entry';
    const page = (index: number, returning: boolean): StreamKnowledgePage => {
      const here = at(0, space(index));
      const openings: StreamKnowledgePage['openings'] = {};
      if (index) openings.parent = { ...here, id: 'parent', direction: 'west', destination: at(0, space(index - 1)), observedAt: f.checkpoint.revision };
      if (index < depth) openings.child = { ...here, id: 'child', direction: 'east', observedAt: f.checkpoint.revision,
        ...(returning ? { destination: at(0, space(index + 1)) } : {}) };
      return { version: 1, spaceId: here.spaceId, revision: f.checkpoint.revision, cells: {
        [addressKey(here)]: { ...here, links: [], observedAt: f.checkpoint.revision },
      }, chests: {}, openings, frontiers: {}, parentOpeningId: index ? 'parent' : undefined,
      completedExits: returning && index < depth ? ['child'] : [], cleared: returning };
    };
    for (const returning of [false, true]) {
      for (let count = 0; count < depth; count++) {
        const index = returning ? depth - count : count;
        f.checkpoint.position = at(0, space(index));
        f.page = page(index, returning);
        expect(choose(planner, f).command).toEqual({ type: 'move', direction: returning ? 'west' : 'east' });
        expect(planner.diagnostics.cache).toMatchObject({ pages: 1, cells: 1, batchSteps: 1 });
        expect(planner.diagnostics.cache.ports).toBeLessThanOrEqual(2);
        f.checkpoint.revision++;
        f.checkpoint.moves++;
      }
    }
    f.checkpoint.position = at(0);
    f.page = page(0, true);
    expect(choose(planner, f).command).toEqual({ type: 'finish' });
    expect(planner.diagnostics.work.expandedCells).toBe(2 * depth + 1);
  });

  const corrupt: [string, (f: Fixture) => void][] = [
    ['empty cells', f => { f.page.cells = {}; }],
    ['wrong page', f => { f.page.spaceId = 'elsewhere'; }],
    ['future page', f => { f.page.revision = 1; }],
    ['future observation', f => { f.page.cells[addressKey(at(0))].observedAt = 1; }],
    ['cell key mismatch', f => { f.page.cells.bad = f.page.cells[addressKey(at(0))]; }],
    ['nonreciprocal link', f => { f.page.cells[addressKey(at(1))].links = []; }],
    ['disconnected objective', f => { f.page.cells[addressKey(at(0))].links = []; f.page.cells[addressKey(at(1))].links = []; }],
    ['unobserved chest location', f => { f.page.chests['loot-1'].column = 2; }],
    ['missing parent port', f => { f.page.parentOpeningId = 'absent'; }],
    ['unlearned completed exit', f => { f.page.completedExits = ['absent']; }],
    ['false cleared flag', f => { f.page.cleared = true; }],
    ['overlapping local port', f => { f.page.openings.door = { ...at(0), id: 'door', direction: 'east', observedAt: 0 }; }],
    ['too many ports', f => { for (let i = 0; i < 5; i++) f.page.frontiers[String(i)] = { ...at(0), id: String(i), direction: 'north', observedAt: 0 }; }],
    ['invalid checkpoint', f => { f.checkpoint = null as unknown as StreamCheckpoint; }],
    ['oversized page', f => { f.page = fixture(513).page; }],
  ];
  it.each(corrupt)('blocks %s without inventing a command or throwing', (_name, mutate) => {
    const f = fixture(2, [1]);
    mutate(f);
    const planner = new StreamPlanner();
    const decision = planner.choose(f.checkpoint, f.page, control);
    expect(decision.command).toBeUndefined();
    expect(decision.reason).toMatch(/^Blocked:/);
    expect(planner.diagnostics.cache.pages).toBe(0);
    expect(planner.diagnostics.lastWork.auditedRecords).toBeLessThanOrEqual(1029);
  });

  it.each([0, -1, 513, Infinity, 1.5])('rejects invalid batch bound %s', maxBatchSteps => {
    expect(() => new StreamPlanner({ maxBatchSteps })).toThrow(/maxBatchSteps/);
  });
});
