import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSession, type CommandKind } from './GameSession';
import type { CanonicalCommit } from './CanonicalHostCommand';
import type { CanonicalHead, CanonicalRequest, JsonObject } from '../../persistence/canonical/types';
import { checkpointJson, gameCheckpoint } from '../../persistence/canonical/game/checkpoint';
import { earnedCell, knowledgeFixture } from '../../persistence/canonical/knowledge/region.test-support';
import { protocolHead } from '../../persistence/canonical/agentica/types.test-support';
import { exploreView } from '../../components/ExploreScreen.test-support';

const mocks = vi.hoisted(() => {
  const locks: Lock[] = [];
  class Lock {
    supported = true; held = false;
    readonly lost: () => void;
    constructor(lost: () => void) { this.lost = lost; locks.push(this); }
    acquire = vi.fn(async () => { this.held = true; return true; });
    release = vi.fn(() => { this.held = false; });
  }
  return { Lock, locks, has: vi.fn(), create: vi.fn(), readHead: vi.fn(), project: vi.fn(), control: vi.fn(),
    exploration: vi.fn(), roster: vi.fn(), content: vi.fn(), settings: vi.fn(), auto: vi.fn(), combat: vi.fn(), save: vi.fn(), list: vi.fn(), operate: vi.fn() };
});
vi.mock('./BrowserSaveLock', () => ({ BrowserSaveLock: mocks.Lock }));
vi.mock('../../persistence/canonical/read', () => ({ readCanonicalHead: mocks.readHead }));
vi.mock('../../persistence/canonical/transaction', async original => ({
  ...await original<typeof import('../../persistence/canonical/transaction')>(), controlCanonical: mocks.control, operateCanonical: mocks.operate,
}));
vi.mock('../../persistence/canonical/game/initialize', () => ({ hasCanonicalGame: mocks.has, createCanonicalGame: mocks.create }));
vi.mock('../../persistence/canonical/game/projection', () => ({ projectGame: mocks.project }));
vi.mock('../../persistence/canonical/game/explorationCommand', () => ({ executeExplorationCommand: mocks.exploration }));
vi.mock('../../persistence/canonical/game/rosterCommand', () => ({ executeRosterCommand: mocks.roster }));
vi.mock('../../persistence/canonical/game/contentCommand', () => ({ executeContentCommand: mocks.content }));
vi.mock('../../persistence/canonical/game/settings', () => ({ executeSettingsCommand: mocks.settings }));
vi.mock('../../persistence/canonical/auto/command', () => ({ executeAutoCommand: mocks.auto }));
vi.mock('../../persistence/canonical/combat/command', () => ({ executeBattleCommand: mocks.combat }));
vi.mock('../../persistence/canonical/game/manualSaves', () => ({ executeSaveCommand: mocks.save, listManualSaves: mocks.list }));

let head: CanonicalHead, session: GameSession;
const stats = { reads: 1, writes: 1, readBytes: 1, writeBytes: 1 };
function commit(request: CanonicalRequest): CanonicalCommit {
  const beforeRevision = head.revision; head = { ...head, revision: beforeRevision + 1 };
  return { head: structuredClone(head), replayed: false, stats, receipt: { generation: head.generation, gameId: head.gameId,
    attemptId: request.attemptId, fingerprint: 'test', beforeRevision, afterRevision: head.revision,
    committedAt: '2026-10-18T00:00:00.000Z', result: {} } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
const host = (execute = vi.fn(async (request: CanonicalRequest) => commit(request))) => ({ kind: 'fresh' as const,
  operation: 'agentica.test', input: {}, signal: session.hostSignal, execute });
const cleanup = () => session.cleanupHostOperation({ kind: 'cancel', target: {
  gameId: head.gameId, generation: head.generation, operationId: 'funded-navigation' } }, session.hostSignal);

beforeEach(async () => {
  vi.resetAllMocks(); mocks.locks.length = 0;
  session = new GameSession(() => {});
  const fixture = knowledgeFixture(); await fixture.observe([earnedCell()]);
  head = { ...protocolHead(), owner: session.owner, checkpoint: checkpointJson(fixture.checkpoint()) };
  mocks.has.mockResolvedValue(true); mocks.list.mockResolvedValue([]);
  mocks.readHead.mockImplementation(async () => ({ head: structuredClone(head) }));
  mocks.project.mockImplementation(async (snapshot: CanonicalHead) => ({ head: structuredClone(snapshot), stats,
    value: { ...exploreView(), id: snapshot.gameId, mode: gameCheckpoint(snapshot.checkpoint).mode,
      checkpoint: gameCheckpoint(snapshot.checkpoint), snapshot: structuredClone(snapshot) } }));
  mocks.create.mockImplementation(async (owner: string) => ({ head: head = { ...head, owner, gameId: 'new-game' } }));
  mocks.control.mockImplementation(async (request: CanonicalRequest) => {
    head = { ...head, owner: session.owner, epoch: head.epoch + 1 }; return commit(request);
  });
  for (const handler of [mocks.exploration, mocks.roster, mocks.content, mocks.auto, mocks.combat, mocks.save, mocks.operate]) {
    handler.mockImplementation(async (request: CanonicalRequest) => commit(request));
  }
  mocks.settings.mockImplementation(async (request: CanonicalRequest) => {
    const input = request.input as JsonObject, checkpoint = gameCheckpoint(head.checkpoint);
    if (input.kind === 'auto') head = { ...head, checkpoint: checkpointJson({ ...checkpoint,
      ...(checkpoint.mode === 'town' ? { townReturnMode: input.enabled ? 'auto-play' : 'manual' } : { mode: input.enabled ? 'auto-play' : 'manual' }) }) };
    return commit(request);
  });
  await session.start(); vi.clearAllMocks();
});
afterEach(() => session.stop());

describe('GameSession presentation source-cell fence', () => {
  it.each(['end', 'automation', 'skill'])('cancels stale queued battle %s without dropping custody', async kind => {
    const gate = deferred<void>(), entered = deferred<void>();
    session.view.game!.battle = { id: 'battle', wave: 1, status: 'active', round: 1, enemies: [], log: [] };
    mocks.combat.mockImplementationOnce(async (request: CanonicalRequest) => {
      entered.resolve(); await gate.promise; return commit(request);
    });
    const first = session.execute('combat', { kind: 'end', battleId: 'battle' }); await entered.promise;
    const stale = session.execute('combat', { kind, battleId: 'battle' });
    const rejected = expect(stale).rejects.toThrow('Battle input cancelled');
    gate.resolve(); await first; await rejected; await session.flush();
    expect(mocks.combat).toHaveBeenCalledOnce();
    expect(mocks.combat.mock.calls[0][0].operation).toBe('battle.command');
    expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false });
    expect(mocks.locks[0].held).toBe(true);
    await session.execute('exploration', { kind: 'look' });
    expect(mocks.exploration).toHaveBeenCalledOnce();
  });
  it.each(['move', 'stairs'])('cancels stale queued %s at the writer boundary without losing custody', async kind => {
    const gate = deferred<void>(), entered = deferred<void>();
    const source = structuredClone(session.view.game!.checkpoint.position), before = head.revision;
    const destination = { ...source, cell: { ...source.cell, column: source.cell.column + 1 } };
    mocks.exploration.mockImplementationOnce(async (request: CanonicalRequest) => {
      entered.resolve(); await gate.promise;
      const checkpoint = gameCheckpoint(head.checkpoint);
      head = { ...head, checkpoint: checkpointJson({ ...checkpoint,
        position: destination }) };
      return commit(request);
    });
    const running = session.execute('exploration', { kind: 'move', direction: 'east' }); await entered.promise;
    const stale = session.execute('exploration', { kind, direction: kind === 'move' ? 'east' : 'down' }, { expectedPosition: source });
    const rejected = expect(stale).rejects.toThrow('actor has moved');
    source.cell.column++; // Mutation after admission cannot retarget the queued intent.
    gate.resolve(); await running; await rejected; await session.flush();
    expect(mocks.exploration).toHaveBeenCalledOnce(); expect(head.revision).toBe(before + 1);
    expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false });
    expect(mocks.locks[0].held).toBe(true);
    await session.execute('exploration', { kind: 'look' }, { expectedPosition: source });
    expect(mocks.exploration).toHaveBeenCalledTimes(2);
    expect(mocks.exploration.mock.calls[1][0].input).toEqual({ kind: 'look' });
  });
});

describe('GameSession Agentic manual-control lease', () => {
  it.each(['exploration', 'roster', 'content', 'settings', 'auto', 'combat'] as CommandKind[])('rejects ordinary %s without poisoning the writer', async kind => {
    const before = structuredClone(head), signal = session.hostSignal, release = session.acquireAgenticControl();
    await expect(session.execute(kind, { kind: 'test' })).rejects.toThrow('Agentic Play'); await session.flush();
    expect(mocks[kind]).not.toHaveBeenCalled(); expect(head).toEqual(before);
    expect(session.hostSignal).toBe(signal); expect(signal.aborted).toBe(false);
    expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false }); expect(mocks.locks[0].held).toBe(true);
    release(); await session.execute(kind, { kind: 'test' }); expect(mocks[kind]).toHaveBeenCalledOnce();
  });
  it.each(['createManualSave', 'loadSave', 'removeSave', 'resetGame', 'takeControl'] as const)('rejects %s before any side effect', async method => {
    const signal = session.hostSignal, before = structuredClone(head), release = session.acquireAgenticControl();
    await expect(session[method]('save-id')).rejects.toThrow('Agentic Play'); await session.flush();
    expect(head).toEqual(before); expect(signal.aborted).toBe(false); expect(session.hostSignal).toBe(signal);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.control).not.toHaveBeenCalled();
    expect(mocks.locks[0].acquire).not.toHaveBeenCalled(); expect(session.view.controlled).toBe(true);
    release(); await session[method]('save-id'); expect(session.view.controlled).toBe(true);
  });
  it.each([false, true])('invalidates already queued manual work even if released before dequeue=%s', async earlyRelease => {
    const outcomes = Promise.allSettled([session.execute('exploration', {}), session.execute('settings', { kind: 'auto', enabled: true }),
      session.createManualSave(), session.loadSave('saved'), session.removeSave('saved')]);
    const release = session.acquireAgenticControl(); if (earlyRelease) release();
    for (const outcome of await outcomes) {
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') expect(outcome.reason.message).toContain('Agentic Play');
    }
    await session.flush(); expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false });
    expect(mocks.exploration).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    if (!earlyRelease) expect(() => session.acquireAgenticControl()).toThrow('Agentic Play');
    release(); await session.execute('exploration', {}); expect(mocks.exploration).toHaveBeenCalledOnce();
  });
  it('acquires over a running commit and drains it while refusing manual work queued behind it', async () => {
    const gate = deferred<void>(), entered = deferred<void>();
    mocks.exploration.mockImplementationOnce(async (request: CanonicalRequest) => { entered.resolve(); await gate.promise; return commit(request); });
    const pending = session.execute('exploration', {}); await entered.promise;
    const queued = session.execute('roster', {}), outcomes = Promise.allSettled([pending, queued]);
    const release = session.acquireAgenticControl(); let flushed = false;
    const barrier = session.flush().then(() => { flushed = true; });
    await Promise.resolve(); expect(flushed).toBe(false);
    gate.resolve(); await barrier;
    expect((await outcomes).map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(mocks.roster).not.toHaveBeenCalled(); expect(mocks.exploration).toHaveBeenCalledOnce();
    expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false });
    await expect(session.execute('exploration', {})).rejects.toThrow('Agentic Play');
    release(); await session.execute('exploration', {});
  });
  it('continues a queued host command after refusing an older manual admission', async () => {
    const manual = session.execute('exploration', {}), command = host(), pending = session.submitHostCommand(command);
    const settled = Promise.allSettled([manual, pending]), release = session.acquireAgenticControl();
    expect((await settled).map(result => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(mocks.exploration).not.toHaveBeenCalled(); expect(command.execute).toHaveBeenCalledOnce();
    expect(session.view).toMatchObject({ controlled: true, recoveryRequired: false });
    await expect(session.execute('exploration', {})).rejects.toThrow('Agentic Play'); release();
  });
  it('exposes an already-running Auto-on commit for the controller to revalidate after flush', async () => {
    const gate = deferred<void>(), entered = deferred<void>();
    mocks.settings.mockImplementationOnce(async (request: CanonicalRequest) => {
      entered.resolve(); await gate.promise;
      head = { ...head, checkpoint: checkpointJson({ ...gameCheckpoint(head.checkpoint), mode: 'auto-play' }) }; return commit(request);
    });
    const pending = session.execute('settings', { kind: 'auto', enabled: true }); await entered.promise;
    const release = session.acquireAgenticControl(); gate.resolve(); await session.flush(); await pending;
    expect(session.view.game?.mode).toBe('auto-play');
    await expect(session.execute('auto', {})).rejects.toThrow('Agentic Play');
    release(); expect(() => session.acquireAgenticControl()).toThrow('Disable Auto');
  });
  it('does not orphan a lease when the already-running manual commit fails behind the flush barrier', async () => {
    const gate = deferred<void>(), entered = deferred<void>();
    mocks.exploration.mockImplementationOnce(async () => { entered.resolve(); await gate.promise; throw Error('Commit failed'); });
    const pending = session.execute('exploration', {}), settled = Promise.allSettled([pending]); await entered.promise;
    const release = session.acquireAgenticControl(); gate.resolve(); await session.flush();
    expect((await settled)[0].status).toBe('rejected'); expect(session.view.recoveryRequired).toBe(true);
    await session.takeControl(); const current = session.acquireAgenticControl(); release();
    await expect(session.createManualSave()).rejects.toThrow('Agentic Play'); current();
  });
  it.each(['auto-play', 'town'] as const)('requires explicit ordinary Auto-off before acquiring from %s', async mode => {
    head = { ...head, revision: head.revision + 1, checkpoint: checkpointJson({ ...gameCheckpoint(head.checkpoint), mode,
      ...(mode === 'town' ? { townReturnMode: 'auto-play' as const } : {}) }) };
    await session.refresh(); expect(() => session.acquireAgenticControl()).toThrow('Disable Auto'); expect(mocks.settings).not.toHaveBeenCalled();
    await session.execute('settings', { kind: 'auto', enabled: false });
    const release = session.acquireAgenticControl(); release(); expect(mocks.settings).toHaveBeenCalledOnce();
  });
  it('leaves host commands, funded cleanup, flush and read refreshes available without releasing the lease', async () => {
    const release = session.acquireAgenticControl(), command = host();
    await session.submitHostCommand(command); await cleanup(); await session.flush(); await session.refresh(); await session.refreshSaves();
    expect(command.execute).toHaveBeenCalledOnce(); expect(mocks.operate).toHaveBeenCalledOnce();
    expect(mocks.readHead).toHaveBeenCalled(); expect(mocks.list).toHaveBeenCalledOnce();
    await expect(session.execute('exploration', {})).rejects.toThrow('Agentic Play');
    release();
  });
  it('keeps duplicate acquisition and stale releases from unlocking a later lease', async () => {
    const first = session.acquireAgenticControl(); expect(() => session.acquireAgenticControl()).toThrow('Agentic Play');
    first(); first(); const second = session.acquireAgenticControl(); first();
    await expect(session.execute('exploration', {})).rejects.toThrow('Agentic Play');
    second(); await session.execute('exploration', {});
  });
  it.each(['stop', 'start', 'lost lock'] as const)('invalidates the lease on lifetime abort: %s', async action => {
    const old = session.acquireAgenticControl(), signal = session.hostSignal;
    if (action === 'stop') session.stop();
    else if (action === 'lost lock') mocks.locks[0].lost();
    else await session.start();
    expect(signal.aborted).toBe(true);
    if (action !== 'start') { expect(() => session.acquireAgenticControl()).toThrow(); await session.start(); }
    const current = session.acquireAgenticControl(); old();
    await expect(session.createManualSave()).rejects.toThrow('Agentic Play'); current();
    await session.createManualSave();
  });
  it.each(['owner', 'game', 'generation', 'epoch'] as const)('invalidates old lease on refreshed %s without allowing stale releases', async change => {
    const old = session.acquireAgenticControl();
    head = { ...head, revision: head.revision + 1, ...(change === 'owner' ? { owner: 'another-owner' }
      : change === 'game' ? { gameId: 'another-game' } : change === 'generation' ? { generation: 'another-generation' } : { epoch: head.epoch + 1 }) };
    await session.refresh();
    if (change === 'owner') await session.takeControl();
    const current = session.acquireAgenticControl(); old();
    await expect(session.loadSave('old-save')).rejects.toThrow('Agentic Play'); current();
  });
  it.each(['host', 'refresh', 'cleanup'] as const)('releases after %s failure without aborting the signal needed for cleanup', async kind => {
    const old = session.acquireAgenticControl(), signal = session.hostSignal;
    let pending: Promise<unknown>;
    if (kind === 'host') pending = session.submitHostCommand(host(vi.fn(async () => { throw Error('Quota exhausted'); })));
    else if (kind === 'refresh') { mocks.readHead.mockRejectedValueOnce(Error('Invalid head')); pending = session.refresh(); }
    else { mocks.operate.mockRejectedValueOnce(Error('Cleanup storage error')); pending = cleanup(); }
    await expect(pending).rejects.toThrow();
    await session.flush(); expect(signal.aborted).toBe(false);
    expect(session.view).toMatchObject({ controlled: false, recoveryRequired: true });
    expect(() => session.acquireAgenticControl()).toThrow('Game control unavailable');
    await cleanup(); await session.takeControl();
    const current = session.acquireAgenticControl(); old();
    await expect(session.execute('exploration', {})).rejects.toThrow('Agentic Play'); current();
  });
  it('prevents acquisition during an already queued recovery', async () => {
    const recovering = session.takeControl(); expect(() => session.acquireAgenticControl()).toThrow('Game control unavailable');
    await recovering; session.acquireAgenticControl()();
  });
});
