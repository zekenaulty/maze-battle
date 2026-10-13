import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from './GameSession';
import type { GameSessionView } from './GameSession';
import type { GameView } from './GameView';
import type { CanonicalHead, CanonicalRequest, Json, JsonObject } from '../../persistence/canonical/types';
import { checkpointJson, gameCheckpoint } from '../../persistence/canonical/game/checkpoint';
import { earnedCell, knowledgeFixture } from '../../persistence/canonical/knowledge/region.test-support';
import { exploreView } from '../../components/ExploreScreen.test-support';

const mocks = vi.hoisted(() => {
  const lockState = { supported: true, available: true, locks: [] as Lock[] };
  class Lock {
    held = false;
    readonly lost: () => void;
    constructor(lost: () => void) { this.lost = lost; lockState.locks.push(this); }
    get supported() { return lockState.supported; }
    acquire = vi.fn(async (_steal = false) => { this.held = lockState.available; return this.held; });
    release = vi.fn(() => { this.held = false; });
  }
  return { Lock, lockState, has: vi.fn(), create: vi.fn(), readHead: vi.fn(), project: vi.fn(),
    control: vi.fn(), prepare: vi.fn(), exploration: vi.fn(), roster: vi.fn(), content: vi.fn(),
    settings: vi.fn(), save: vi.fn(), listSaves: vi.fn(), read: vi.fn(), loadRoster: vi.fn(),
    quests: vi.fn(), contracts: vi.fn(), loadSettings: vi.fn() };
});
vi.mock('./BrowserSaveLock', () => ({ BrowserSaveLock: mocks.Lock }));
vi.mock('../../persistence/canonical/read', () => ({ readCanonicalHead: mocks.readHead, readCanonical: mocks.read,
  snapshotOf: (head: CanonicalHead) => structuredClone({ generation: head.generation, gameId: head.gameId,
    revision: head.revision, roots: head.roots, checkpoint: head.checkpoint }) }));
vi.mock('../../persistence/canonical/transaction', () => ({ controlCanonical: mocks.control,
  canonicalFence: (head: CanonicalHead) => ({ generation: head.generation, gameId: head.gameId,
    owner: head.owner, epoch: head.epoch, revision: head.revision }) }));
vi.mock('../../persistence/canonical/game/initialize', () => ({ hasCanonicalGame: mocks.has, createCanonicalGame: mocks.create }));
vi.mock('../../persistence/canonical/game/preparation', () => ({ prepareGameFloor: mocks.prepare }));
vi.mock('../../persistence/canonical/game/projection', () => ({ projectGame: mocks.project }));
vi.mock('../../persistence/canonical/game/explorationCommand', () => ({ executeExplorationCommand: mocks.exploration }));
vi.mock('../../persistence/canonical/game/rosterCommand', () => ({ executeRosterCommand: mocks.roster }));
vi.mock('../../persistence/canonical/game/contentCommand', () => ({ executeContentCommand: mocks.content }));
vi.mock('../../persistence/canonical/game/settings', () => ({ executeSettingsCommand: mocks.settings, loadGameSettings: mocks.loadSettings }));
vi.mock('../../persistence/canonical/game/manualSaves', () => ({ executeSaveCommand: mocks.save, listManualSaves: mocks.listSaves }));
vi.mock('../../persistence/canonical/roster/projection', () => ({ loadRoster: mocks.loadRoster }));
vi.mock('../../persistence/canonical/content/queries', () => ({ listFloorQuests: mocks.quests, listFloorContracts: mocks.contracts }));

let head: CanonicalHead, base: GameView, fixture: ReturnType<typeof knowledgeFixture>;
const sessions: GameSession[] = [];
const stats = { reads: 4, writes: 2, readBytes: 100, writeBytes: 80 };
const cloneHead = () => structuredClone(head);
function projection(snapshot: CanonicalHead) {
  const checkpoint = gameCheckpoint(snapshot.checkpoint);
  return { head: structuredClone(snapshot), value: { ...base, id: snapshot.gameId, mode: checkpoint.mode, checkpoint,
    snapshot: structuredClone({ generation: snapshot.generation, gameId: snapshot.gameId, revision: snapshot.revision,
      roots: snapshot.roots, checkpoint: snapshot.checkpoint }) } satisfies GameView, stats };
}
function commit(request: CanonicalRequest, result: Json = { applied: true }, patch: Partial<CanonicalHead> = {}) {
  expect(request.expected).toEqual({ generation: head.generation, gameId: head.gameId,
    owner: head.owner, epoch: head.epoch, revision: head.revision });
  const beforeRevision = head.revision;
  head = { ...head, ...patch, revision: beforeRevision + 1 };
  return { head: cloneHead(), receipt: { generation: head.generation, gameId: head.gameId, attemptId: request.attemptId,
    fingerprint: 'fixture-request', beforeRevision, afterRevision: head.revision, committedAt: '2026-10-13T00:00:00.000Z', result },
  replayed: false, stats };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function session() {
  const views: GameSessionView[] = [], controller = new GameSession(view => views.push(view));
  sessions.push(controller); return { controller, views };
}
beforeEach(async () => {
  vi.resetAllMocks(); sessions.length = 0;
  mocks.lockState.supported = true; mocks.lockState.available = true; mocks.lockState.locks.length = 0;
  fixture = knowledgeFixture(); const observation = await fixture.observe([earnedCell()]);
  base = { ...exploreView(), checkpoint: fixture.checkpoint(), observation, autoThrottleMs: 500, randomBattles: false };
  head = { schema: 1, generation: 'generation', gameId: 'canonical-game', owner: 'previous-tab', epoch: 3, revision: 7,
    status: 'ready', roots: { knowledge: 'earned-root', world: 'world-root', execution: null },
    checkpoint: checkpointJson(base.checkpoint), allocations: {},
    quota: { usedBytes: 0, limitBytes: 1000000, reserveBytes: 100000, reservedBytes: 0, reservations: 0 } };
  mocks.has.mockResolvedValue(true); mocks.readHead.mockImplementation(async () => ({ head: cloneHead() }));
  mocks.create.mockImplementation(async (owner: string, reset: boolean) => {
    head = { ...head, owner, epoch: 1, revision: 1, gameId: reset ? 'reset-game' : 'new-game',
      checkpoint: checkpointJson({ ...base.checkpoint, knowledge: null }) };
    return { head: cloneHead() };
  });
  mocks.control.mockImplementation(async (request: CanonicalRequest, action: string) => commit(request, { controlled: true }, {
    owner: (request.input as JsonObject).owner as string, epoch: head.epoch + 1, status: action === 'resume' ? 'ready' : 'stopped',
  }));
  mocks.prepare.mockImplementation(async (request: CanonicalRequest) => commit(request, { phase: 'ready' }));
  mocks.exploration.mockImplementation(async (request: CanonicalRequest) => commit(request, { applied: true }, {
    checkpoint: checkpointJson({ ...gameCheckpoint(head.checkpoint), knowledge: base.checkpoint.knowledge }),
  }));
  for (const handler of [mocks.roster, mocks.content, mocks.settings, mocks.save]) handler.mockImplementation(async (request: CanonicalRequest) => commit(request));
  mocks.settings.mockImplementation(async (request: CanonicalRequest) => {
    const input = request.input as JsonObject, checkpoint = gameCheckpoint(head.checkpoint);
    const mode = input.enabled ? 'auto-play' : 'manual';
    return commit(request, { applied: true }, input.kind === 'auto' ? { checkpoint: checkpointJson({ ...checkpoint,
      ...(checkpoint.mode === 'town' ? { townReturnMode: mode } : { mode }) }) } : {});
  });
  mocks.project.mockImplementation(async (snapshot: CanonicalHead) => projection(snapshot)); mocks.listSaves.mockResolvedValue([]);
  mocks.loadRoster.mockResolvedValue({ state: base }); mocks.quests.mockResolvedValue({ quests: [] });
  mocks.contracts.mockResolvedValue({ contracts: [] }); mocks.loadSettings.mockResolvedValue({ autoThrottleMs: 500, randomBattles: false });
});
afterEach(() => { for (const controller of sessions) controller.stop(); });

describe('canonical GameSession startup and recovery', () => {
  it('claims, resumes, then publishes one validated snapshot without recreating an existing game', async () => {
    const { controller, views } = session(); await controller.start();
    expect(mocks.control.mock.calls.map(call => call[1])).toEqual(['takeover', 'resume']);
    expect(controller.view).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, status: 'Ready' });
    expect(controller.view.game?.snapshot).toEqual(projection(head).value.snapshot);
    expect(controller.view.game?.checkpoint.knowledge).toEqual(base.checkpoint.knowledge);
    expect(views.filter(view => view.controlled).every(view => view.game?.snapshot.revision === head.revision)).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.exploration).not.toHaveBeenCalled();
  });

  it('prepares and earns an initial observation before publishing a new game', async () => {
    mocks.has.mockResolvedValue(false); const { controller, views } = session(); await controller.start();
    expect(mocks.create).toHaveBeenCalledWith(controller.owner, false, expect.any(AbortSignal));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.exploration.mock.calls[0][0]).toMatchObject({ operation: 'exploration.command', input: { kind: 'look' } });
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.exploration.mock.invocationCallOrder[0]);
    expect(mocks.exploration.mock.invocationCallOrder[0]).toBeLessThan(mocks.project.mock.invocationCallOrder[0]);
    expect(views.filter(view => view.game).every(view => view.game!.checkpoint.knowledge !== null)).toBe(true);
  });

  it('loads read-only when the writer lock is unavailable, without claiming or writing', async () => {
    mocks.lockState.available = false; const { controller } = session(); await controller.start();
    expect(controller.view).toMatchObject({ controlled: false, recoveryRequired: false, status: 'Read only: another tab controls this game.' });
    expect(controller.view.game).toBeDefined(); expect(mocks.control).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    await expect(controller.execute('exploration', { kind: 'look' })).rejects.toThrow('Game control unavailable');
    expect(mocks.exploration).not.toHaveBeenCalled();
  });

  it.each(['open', 'projection', 'save list'] as const)('latches a %s failure and requires explicit recovery without resetting saves', async stage => {
    const error = new Error(`Invalid canonical ${stage}`);
    ({ open: mocks.has, projection: mocks.project, 'save list': mocks.listSaves })[stage].mockRejectedValueOnce(error);
    const { controller } = session(); await expect(controller.start()).rejects.toThrow(error);
    await controller.flush();
    expect(controller.view).toMatchObject({ controlled: false, recoveryRequired: true, busy: false, status: `Action failed: ${error.message}` });
    expect(mocks.lockState.locks[0].held).toBe(false); const reads = mocks.readHead.mock.calls.length;
    await controller.refresh(); expect(mocks.readHead).toHaveBeenCalledTimes(reads); expect(mocks.create).not.toHaveBeenCalled();
    await controller.takeControl();
    expect(controller.view).toMatchObject({ controlled: true, recoveryRequired: false, status: 'Ready' });
    expect(mocks.lockState.locks[0].acquire).toHaveBeenLastCalledWith(true); expect(mocks.create).not.toHaveBeenCalled();
  });

  it('resets only on the explicit reset path and republishes the new identity', async () => {
    const { controller } = session(); await controller.start(); await controller.resetGame();
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(controller.owner, true, expect.any(AbortSignal));
    expect(controller.view.game?.id).toBe('reset-game'); expect(controller.view.controlled).toBe(true);
  });

  it('rejects a projection returned for a different revision instead of publishing mixed snapshots', async () => {
    mocks.project.mockImplementationOnce(async (snapshot: CanonicalHead) => ({ ...projection(snapshot), head: { ...snapshot, revision: snapshot.revision + 1 } }));
    const { controller } = session(); await expect(controller.start()).rejects.toThrow('Game changed during publication');
    expect(controller.view.game).toBeUndefined(); expect(controller.view.recoveryRequired).toBe(true);
  });

  it('does not claim custody if startup was stopped while reading the canonical head', async () => {
    const read = deferred<{ head: CanonicalHead }>(); mocks.readHead.mockReturnValueOnce(read.promise);
    const { controller } = session(), starting = controller.start(), settled = Promise.allSettled([starting]);
    await vi.waitFor(() => expect(mocks.readHead).toHaveBeenCalledOnce());
    controller.stop(); read.resolve({ head: cloneHead() }); await settled; await controller.flush();
    expect(mocks.control).not.toHaveBeenCalled(); expect(mocks.project).not.toHaveBeenCalled();
    expect(controller.view).toMatchObject({ controlled: false, status: 'Paused' });
  });

  it('does not issue an initial look after preparation completes for a stopped startup', async () => {
    mocks.has.mockResolvedValue(false);
    const preparation = deferred<ReturnType<typeof commit>>(); mocks.prepare.mockReturnValueOnce(preparation.promise);
    const { controller, views } = session(), starting = controller.start(), settled = Promise.allSettled([starting]);
    await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
    controller.stop(); const count = views.length;
    preparation.resolve(commit(mocks.prepare.mock.calls[0][0], { phase: 'ready' })); await settled; await controller.flush();
    expect(mocks.exploration).not.toHaveBeenCalled(); expect(mocks.project).not.toHaveBeenCalled(); expect(views).toHaveLength(count);
  });
});

describe('canonical command queue and revocation', () => {
  it('serializes accepted commands with advancing fences and distinct attempt receipts', async () => {
    const { controller } = session(); await controller.start(); const revision = head.revision;
    const receipts = await Promise.all([controller.execute('exploration', { kind: 'look' }), controller.execute('settings', { kind: 'throttle', ms: 250 })]);
    expect(receipts.map(receipt => receipt.afterRevision)).toEqual([revision + 1, revision + 2]);
    expect(new Set(receipts.map(receipt => receipt.attemptId)).size).toBe(2);
    expect(mocks.settings.mock.calls[0][0].expected.revision).toBe(revision + 1);
    expect(controller.view.game?.snapshot.revision).toBe(revision + 2);
    expect(controller.view.diagnostics.map(item => item.action)).toEqual(['exploration', 'settings']);
  });

  it('does not dispatch queued commands after a failure or replay them during explicit recovery', async () => {
    const { controller } = session(); await controller.start();
    mocks.exploration.mockRejectedValueOnce(new Error('Quota exhausted'));
    const outcomes = await Promise.allSettled([controller.execute('exploration', { kind: 'look' }), controller.execute('content', { kind: 'claim' })]);
    expect(outcomes.map(outcome => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(mocks.content).not.toHaveBeenCalled(); expect(controller.view.recoveryRequired).toBe(true);
    expect(controller.view.controlled).toBe(false); await controller.takeControl();
    expect(mocks.exploration).toHaveBeenCalledOnce(); expect(mocks.content).not.toHaveBeenCalled();
    await controller.execute('content', { kind: 'claim' }); expect(mocks.content).toHaveBeenCalledOnce();
  });

  it.each(['success', 'failure'])('revokes in-flight and queued work without publishing a late %s', async completion => {
    const { controller, views } = session(); await controller.start();
    const pending = deferred<ReturnType<typeof commit>>(); mocks.exploration.mockReturnValueOnce(pending.promise);
    const outcomes = Promise.allSettled([controller.execute('exploration', { kind: 'look' }), controller.execute('content', { kind: 'claim' })]);
    await vi.waitFor(() => expect(mocks.exploration).toHaveBeenCalledOnce());
    mocks.lockState.locks[0].lost(); const count = views.length, before = controller.view.game;
    if (completion === 'success') pending.resolve(commit(mocks.exploration.mock.calls[0][0]));
    else pending.reject(new Error('Late storage failure'));
    expect((await outcomes).map(outcome => outcome.status)).toEqual(['rejected', 'rejected']); await controller.flush();
    expect(views).toHaveLength(count); expect(controller.view.game).toBe(before); expect(mocks.content).not.toHaveBeenCalled();
    expect(controller.view).toMatchObject({ controlled: false, status: 'Read only: control moved to another tab.' });
  });

  it('passes exact save identities to canonical commands and refreshes summaries after commit', async () => {
    const { controller } = session(); await controller.start();
    await controller.createManualSave(); await controller.loadSave('snapshot-17'); await controller.removeSave('snapshot-18');
    expect(mocks.save.mock.calls.map(call => call[0].input)).toEqual([
      { kind: 'create', label: expect.any(String) }, { kind: 'load', id: 'snapshot-17' }, { kind: 'delete', id: 'snapshot-18' },
    ]);
    expect(mocks.listSaves).toHaveBeenCalledTimes(4); expect(controller.view.status).toBe('Saved');
  });

  it.each(['auto-play', 'town'] as const)('normalizes a loaded %s Auto checkpoint before making it playable', async mode => {
    const { controller, views } = session(); await controller.start(); const count = views.length;
    mocks.save.mockImplementationOnce(async (request: CanonicalRequest) => commit(request, { kind: 'load', id: 'saved-auto' }, {
      checkpoint: checkpointJson({ ...base.checkpoint, mode, ...(mode === 'town' ? { townReturnMode: 'auto-play' as const } : {}) }),
    }));
    mocks.project.mockClear(); await controller.loadSave('saved-auto');
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.settings.mock.calls[0][0]).toMatchObject({ operation: 'settings.command', input: { kind: 'auto', enabled: false } });
    expect(mocks.settings.mock.invocationCallOrder[0]).toBeLessThan(mocks.project.mock.invocationCallOrder[0]);
    expect(controller.view.game?.checkpoint).toMatchObject(mode === 'town' ? { mode: 'town', townReturnMode: 'manual' } : { mode: 'manual' });
    expect(views.slice(count).filter(view => view.controlled).every(view => view.game?.checkpoint.mode !== 'auto-play'
      && view.game?.checkpoint.townReturnMode !== 'auto-play')).toBe(true);
  });
});

describe('canonical head refresh', () => {
  it('publishes changed game, roots, and custody together without retaining the old roster projection', async () => {
    const { controller } = session(); await controller.start(); const previous = controller.view.game;
    head = { ...head, revision: head.revision + 1, epoch: head.epoch + 1, owner: 'other-tab', roots: { ...head.roots, knowledge: 'remote-earned-root' } };
    await controller.refresh();
    expect(controller.view.game).not.toBe(previous); expect(controller.view.controlled).toBe(false);
    expect(controller.view.game?.snapshot).toEqual(projection(head).value.snapshot);
    expect(mocks.project).toHaveBeenLastCalledWith(head, undefined);
    await expect(controller.execute('roster', { kind: 'rest' })).rejects.toThrow('Game control unavailable');
  });

  it('deduplicates concurrent refreshes and avoids reprojecting an unchanged head', async () => {
    const { controller } = session(); await controller.start(); const read = deferred<{ head: CanonicalHead }>();
    mocks.readHead.mockClear(); mocks.project.mockClear(); mocks.readHead.mockReturnValueOnce(read.promise);
    const first = controller.refresh(); await controller.refresh();
    await vi.waitFor(() => expect(mocks.readHead).toHaveBeenCalledOnce()); read.resolve({ head: cloneHead() }); await first;
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it('checks generation even when a replacement head has the same revision', async () => {
    const { controller } = session(); await controller.start();
    head = { ...head, generation: 'replacement-generation', gameId: 'replacement-game', owner: 'other-tab' };
    await controller.refresh(); expect(controller.view.game?.snapshot.generation).toBe('replacement-generation');
    expect(controller.view.game?.id).toBe('replacement-game'); expect(controller.view.controlled).toBe(false);
  });

  it('latches refresh corruption and retains the last projection only as non-playable evidence', async () => {
    const { controller } = session(); await controller.start(); const before = controller.view.game;
    mocks.readHead.mockRejectedValueOnce(new Error('Invalid head witness'));
    await expect(controller.refresh()).rejects.toThrow('Invalid head witness'); await controller.flush();
    expect(controller.view.game).toBe(before);
    expect(controller.view).toMatchObject({ controlled: false, recoveryRequired: true, status: 'Action failed: Invalid head witness' });
  });
});

describe('canonical projection evidence contract', () => {
  it('projects an earned observation from a valid checkpoint anchor and the exact supplied snapshot', async () => {
    const { projectGame } = await vi.importActual<typeof import('../../persistence/canonical/game/projection')>('../../persistence/canonical/game/projection');
    mocks.read.mockImplementationOnce(async (query, options) => ({ head: cloneHead(), value: await query(fixture.pages, options.snapshot), stats }));
    const projected = await projectGame(head);
    expect(projected.value.observation).toEqual(base.observation);
    expect(projected.value.checkpoint.knowledge).toEqual(base.checkpoint.knowledge);
    expect(projected.value.snapshot).toEqual(projection(head).value.snapshot);
    expect(projected.value).toMatchObject({ autoThrottleMs: 500, randomBattles: false });
  });
});
