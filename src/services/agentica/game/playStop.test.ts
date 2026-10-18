import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import type { HostCleanup } from '../../game/CanonicalHostRecovery';
import type { OwnerFence } from '../../../persistence/canonical/types';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import { launchGuardId } from '../../../persistence/canonical/agentica/launch';
import { binding } from './pendingRecovery.test-support';
import { stopGamePlay } from './playStop';

const m = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn(), list: vi.fn(), inspect: vi.fn(),
  initial: vi.fn(), granted: vi.fn(), stop: vi.fn(), close: vi.fn() }));
vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: m.read }));
vi.mock('../../../persistence/canonical/agentica/launch', async original => ({
  ...await original<object>(), readLaunch: m.launch,
}));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({
  listAgenticaRecovery: m.list, inspectAgenticaRecovery: m.inspect,
}));
vi.mock('./launchRecovery', () => ({ createLaunchRecovery: m.initial, createGrantedLaunchRecovery: m.granted }));

const launchId = 'play-launch', rootId = launchGuardId(launchId);
const fence: OwnerFence = { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 2, revision: 20 };
const candidate = (id: string): RecoveryCandidate => ({ operationId: id, original: { key: `actions/${id}`, id }, binding });
const cancel = (id: string): HostCleanup => ({ kind: 'cancel', target: {
  generation: fence.generation, gameId: fence.gameId, operationId: id,
} });
const deferred = <T,>() => { let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
let host: AbortController, session: GameSession, order: string[];
const cleanup = vi.fn(), flush = vi.fn(), ordinary = vi.fn(), liveOperation = vi.fn();
const network = vi.fn(), socket = vi.fn();

beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController(); order = [];
  vi.stubGlobal('fetch', network); vi.stubGlobal('WebSocket', socket);
  session = { owner: fence.owner, get hostSignal() { return host.signal; }, flush,
    cleanupHostOperation: cleanup, submitHostCommand: ordinary } as unknown as GameSession;
  flush.mockImplementation(async () => { order.push('flush'); });
  liveOperation.mockResolvedValue({ id: rootId });
  m.read.mockImplementation(async query => { order.push('read'); return { head: { ...fence }, value: await query({ liveOperation }) }; });
  cleanup.mockImplementation(async (command: HostCleanup, signal: AbortSignal) => {
    signal.throwIfAborted(); order.push(`cancel:${'target' in command && command.target.operationId}`);
  });
  m.list.mockResolvedValue({ fence, allocations: [] });
  m.launch.mockResolvedValue({ value: { grant: null } });
  m.initial.mockResolvedValue({ stop: m.stop, close: m.close }); m.granted.mockResolvedValue({ stop: m.stop, close: m.close });
  m.stop.mockImplementation(async () => { order.push('remote-stop'); return { status: 'settled' }; });
});
afterEach(() => {
  expect(ordinary).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

// Orchestration boundaries only: canonical storage, cleanup and root recovery are mocked here.
describe('explicit play Stop boundaries', () => {
  it('waits for local work, then returns locally when no launch guard was admitted', async () => {
    const queued = deferred<void>(); flush.mockReturnValueOnce(queued.promise); liveOperation.mockResolvedValue(null);
    const result = stopGamePlay(session, launchId, host.signal);
    expect(m.read).not.toHaveBeenCalled(); queued.resolve();
    expect(await result).toBe('No launch was admitted.');
    expect(liveOperation).toHaveBeenCalledExactlyOnceWith(rootId);
    for (const fn of [cleanup, m.list, m.inspect, m.launch, m.initial, m.granted, m.stop]) expect(fn).not.toHaveBeenCalled();
  });

  it.each([false, true])('cancels only the matching live root/navigation before root reconciliation (granted=%s)', async granted => {
    const other = candidate('foreign-navigation'), terminal = candidate('terminal-navigation'), active = candidate('active-navigation');
    const allocations = [{ navigation: null }, ...[other, terminal, active].map(navigation => ({ navigation }))];
    m.list.mockResolvedValueOnce({ fence, allocations });
    for (let revision = 21; revision <= 23; revision++) m.list.mockResolvedValueOnce({ fence: { ...fence, revision }, allocations });
    m.inspect.mockImplementation(async (_fence, selected) => ({ launchId: selected === other ? 'other-launch' : launchId,
      operation: { id: selected.operationId, terminal: selected === terminal ? { disposition: 'cancelled' } : null } }));
    m.launch.mockResolvedValue({ value: { grant: granted ? { ref: binding.grant } : null } });
    await stopGamePlay(session, launchId, host.signal);
    expect(cleanup.mock.calls).toEqual([[cancel(rootId), host.signal], [cancel(active.operationId), host.signal]]);
    expect(m.list).toHaveBeenCalledTimes(4);
    for (const [i, selected] of [other, terminal, active].entries()) {
      expect(m.inspect).toHaveBeenNthCalledWith(i + 1, { ...fence, revision: 21 + i }, selected, { signal: host.signal });
    }
    expect(order).toEqual(['flush', 'read', `cancel:${rootId}`, `cancel:${active.operationId}`, 'remote-stop']);
    expect(granted ? m.granted : m.initial).toHaveBeenCalledWith(session, launchId);
    expect(granted ? m.initial : m.granted).not.toHaveBeenCalled();
    expect(m.launch).toHaveBeenCalledExactlyOnceWith(launchId);
    expect(m.stop).toHaveBeenCalledOnce(); expect(m.close).toHaveBeenCalledOnce(); expect(host.signal.aborted).toBe(false);
  });

  it('does not recancel a retained terminal navigation or terminal root', async () => {
    const selected = candidate('terminal-navigation'); liveOperation.mockResolvedValue({ id: rootId, terminal: { disposition: 'cancelled' } });
    m.list.mockResolvedValue({ fence, allocations: [{ navigation: selected }] });
    m.inspect.mockResolvedValue({ launchId, operation: { id: selected.operationId, terminal: { disposition: 'completed' } } });
    await stopGamePlay(session, launchId, host.signal);
    expect(cleanup).not.toHaveBeenCalled(); expect(m.stop).toHaveBeenCalledOnce(); expect(m.close).toHaveBeenCalledOnce();
  });

  it.each(['owner', 'lifetime'])('refuses a different %s before cancellation or recovery', async changed => {
    const signal = host.signal;
    if (changed === 'owner') Object.defineProperty(session, 'owner', { value: 'other-owner' });
    else host = new AbortController();
    await expect(stopGamePlay(session, launchId, signal)).rejects.toThrow('ownership changed');
    for (const fn of [cleanup, m.list, m.initial, m.granted]) expect(fn).not.toHaveBeenCalled();
  });

  it.each(['read', 'cleanup', 'inventory', 'inspection', 'launch'] as const)('keeps a %s refusal local without attempting service Stop', async stage => {
    const error = new Error(`Uncertain ${stage}`), selected = candidate('active-navigation');
    m.list.mockResolvedValue({ fence, allocations: [{ navigation: selected }] });
    m.inspect.mockResolvedValue({ launchId, operation: { id: selected.operationId } });
    ({ read: m.read, cleanup, inventory: m.list, inspection: m.inspect, launch: m.launch })[stage].mockRejectedValueOnce(error);
    await expect(stopGamePlay(session, launchId, host.signal)).rejects.toBe(error);
    for (const fn of [m.initial, m.granted, m.stop, m.close]) expect(fn).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'stop-requested'])('leaves service %s visibly pending without an implicit retry', async status => {
    m.stop.mockResolvedValue({ status, localStopped: true, settled: false });
    expect(await stopGamePlay(session, launchId, host.signal)).toBe('Local play stopped. Service reconciliation remains pending.');
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(cancel(rootId), host.signal);
    expect(m.stop).toHaveBeenCalledOnce(); expect(m.close).toHaveBeenCalledOnce();
  });

  it('reports root acknowledgement without claiming full session clearance', async () => {
    expect(await stopGamePlay(session, launchId, host.signal)).toBe('Local play stopped. Root acknowledged; other recovery may remain.');
  });

  it('preserves a lost Stop reply and closes recovery without retrying or undoing local cancellation', async () => {
    const error = new TypeError('Stop reply lost'); m.stop.mockRejectedValueOnce(error);
    await expect(stopGamePlay(session, launchId, host.signal)).rejects.toBe(error);
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(cancel(rootId), host.signal);
    expect(m.stop).toHaveBeenCalledOnce(); expect(m.close).toHaveBeenCalledOnce();
  });

  it('rejects a late service result after lifetime abort and still closes recovery', async () => {
    const reply = deferred<{ status: string }>(), entered = deferred<void>();
    m.stop.mockImplementation(() => { entered.resolve(); return reply.promise; });
    const result = stopGamePlay(session, launchId, host.signal), rejection = expect(result).rejects.toThrow();
    await entered.promise; host.abort(); reply.resolve({ status: 'settled' }); await rejection;
    expect(m.stop).toHaveBeenCalledOnce(); expect(m.close).toHaveBeenCalledOnce();
  });
});
