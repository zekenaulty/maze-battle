import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import type { HostCleanup } from '../../game/CanonicalHostRecovery';
import type { CanonicalOperation, CanonicalRequest } from '../../../persistence/canonical/types';
import { launchEntryFixture, launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { mazeManifestDigest } from './manifestDigest';
import { binding } from './pendingRecovery.test-support';
import { stopGamePlay } from './playStop';

const m = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn(), list: vi.fn(), inspect: vi.fn(), terminal: vi.fn(), database: vi.fn() }));
vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: m.read }));
vi.mock('../../../persistence/canonical/agentica/launch', async original => ({ ...await original<object>(), readLaunch: m.launch }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: m.list, inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch.terminal', () => ({ readLaunchTerminal: m.terminal }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));

const launchId = 'stop-lifetime', rootId = `agentica-launch:${launchId}`;
const head = { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 2, revision: 20 };
const retained = () => ({ head, value: {
  guard: { id: rootId, admissionAttemptId: 'admission', state: 'settled',
    terminal: { attemptId: 'original-stop', disposition: 'cancelled' } } satisfies Pick<CanonicalOperation, 'id' | 'admissionAttemptId' | 'state' | 'terminal'>,
  binding: { endpoint: 'ws://127.0.0.1:5259/api/host', start: launchStartFixture() },
  dispatch: { ref: { key: 'dispatch', id: 'dispatch-record' }, source: { attemptId: 'original-start' } },
} });
const originalStop: CanonicalRequest = { attemptId: 'original-stop', expected: { ...head, revision: 19 },
  operation: 'operation.cancel', input: { operationId: rootId }, deadlineAt: null };
const deferred = <T,>() => { let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
let host: AbortController, session: GameSession, order: string[];
const cleanup = vi.fn(), flush = vi.fn(), ordinary = vi.fn(), network = vi.fn<typeof fetch>(), socket = vi.fn();

beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController(); order = [];
  vi.stubGlobal('fetch', network); vi.stubGlobal('WebSocket', socket);
  session = { owner: head.owner, get hostSignal() { return host.signal; }, flush,
    cleanupHostOperation: cleanup, submitHostCommand: ordinary } as unknown as GameSession;
  flush.mockResolvedValue(undefined);
  m.read.mockResolvedValue({ head, value: retained().value.guard });
  m.launch.mockImplementation(async () => retained()); m.list.mockResolvedValue({ fence: head, allocations: [] });
  m.terminal.mockResolvedValue({ value: { terminal: { source: originalStop } } });
  m.database.mockImplementation(async (signal: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>) => {
    signal.throwIfAborted(); const result = await work(signal); signal.throwIfAborted(); return result;
  });
  cleanup.mockImplementation(async (_command: HostCleanup, signal: AbortSignal) => {
    signal.throwIfAborted(); expect(signal).toBe(session.hostSignal); order.push('local-cleanup');
  });
  network.mockImplementation(async () => { order.push('http'); return new Response(null, { status: 404 }); });
});
afterEach(() => { expect(ordinary).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

// Real root recovery, transport gate and bounded fetch; storage and GameSession cleanup are mocked.
describe('play Stop lifetime with production root recovery', () => {
  it('awaits matching root and navigation cancellation before any HTTP', async () => {
    const rootEntered = deferred<void>(), navEntered = deferred<void>(), rootDone = deferred<void>(), navDone = deferred<void>();
    const navigation = { operationId: 'active-navigation', original: { key: 'action', id: 'original' }, binding };
    m.read.mockResolvedValue({ head, value: { id: rootId } });
    m.list.mockResolvedValue({ fence: head, allocations: [{ navigation }] });
    m.inspect.mockResolvedValue({ launchId, operation: { id: navigation.operationId } });
    cleanup.mockImplementation(async (command: HostCleanup) => {
      if (command.kind !== 'cancel') { order.push('root-retry'); return; }
      if (command.target.operationId === rootId) { rootEntered.resolve(); await rootDone.promise; order.push('root-cancelled'); }
      else { navEntered.resolve(); await navDone.promise; order.push('navigation-cancelled'); }
    });
    const result = stopGamePlay(session, launchId, host.signal);
    await rootEntered.promise; expect(m.inspect).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    rootDone.resolve(); await navEntered.promise; expect(network).not.toHaveBeenCalled(); expect(m.launch).not.toHaveBeenCalled();
    navDone.resolve(); await expect(result).resolves.toContain('remains pending');
    expect(order).toEqual(['root-cancelled', 'navigation-cancelled', 'root-retry', 'http']);
    expect(cleanup.mock.calls).toEqual([
      ...[rootId, navigation.operationId].map(operationId => [{ kind: 'cancel', target: {
        generation: head.generation, gameId: head.gameId, operationId,
      } }, host.signal]), [{ kind: 'retry', request: originalStop }, host.signal],
    ]);
  });

  it('retries only the retained root cancellation before exact HTTP lookup and leaves absence unknown', async () => {
    expect(await stopGamePlay(session, launchId, host.signal)).toBe('Local play stopped. Service reconciliation remains pending.');
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ kind: 'retry', request: originalStop }, host.signal);
    expect(order).toEqual(['local-cleanup', 'http']); expect(network).toHaveBeenCalledOnce();
    const [input, init] = network.mock.calls[0], url = new URL(String(input));
    expect(url.pathname).toBe('/api/starts');
    expect([...url.searchParams]).toEqual([['hostId', 'maze-battle'], ['sessionId', 'session'], ['attemptId', 'original-start']]);
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit' });
    expect(init!.signal!.aborted).toBe(true); expect(host.signal.aborted).toBe(false);
  });

  it.each(['flush', 'guard', 'inventory', 'recovery-read'])('refuses lifetime abort during %s before cleanup or HTTP', async stage => {
    const entered = deferred<void>(), pending = deferred<unknown>();
    const intercept = () => { entered.resolve(); return pending.promise; };
    if (stage === 'flush') flush.mockImplementationOnce(intercept);
    if (stage === 'guard') m.read.mockImplementationOnce(intercept);
    if (stage === 'inventory') m.list.mockImplementationOnce(intercept);
    if (stage === 'recovery-read') m.launch.mockResolvedValueOnce(retained()).mockImplementationOnce(intercept);
    const result = stopGamePlay(session, launchId, host.signal), rejection = expect(result).rejects.toThrow();
    await entered.promise; host.abort();
    pending.resolve(stage === 'guard' ? { head, value: retained().value.guard }
      : stage === 'inventory' ? { fence: head, allocations: [] } : retained());
    await rejection; expect(cleanup).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('never adopts a replacement lifetime after the wrapper launch read completes late', async () => {
    const entered = deferred<void>(), pending = deferred<ReturnType<typeof retained>>();
    m.launch.mockImplementationOnce(() => { entered.resolve(); return pending.promise; });
    const original = host.signal, result = stopGamePlay(session, launchId, original), rejection = expect(result).rejects.toThrow();
    await entered.promise; host.abort(); host = new AbortController(); pending.resolve(retained()); await rejection;
    expect.soft(cleanup).not.toHaveBeenCalled(); expect.soft(network).not.toHaveBeenCalled();
    expect(host.signal.aborted).toBe(false);
  });

  it('aborts in-flight HTTP and refuses a late response without further cleanup', async () => {
    const entered = deferred<void>(), pending = deferred<Response>();
    network.mockImplementationOnce(() => { entered.resolve(); return pending.promise; });
    const result = stopGamePlay(session, launchId, host.signal), rejection = expect(result).rejects.toThrow();
    await entered.promise; host.abort(); pending.resolve(new Response(null, { status: 404 })); await rejection;
    expect(network.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce(); expect(network).toHaveBeenCalledOnce();
  });

  it('preserves an HTTP failure, closes the helper, and allows only an explicit retry', async () => {
    const error = new TypeError('Service unavailable'); network.mockRejectedValueOnce(error);
    await expect(stopGamePlay(session, launchId, host.signal)).rejects.toBe(error);
    expect(network).toHaveBeenCalledOnce(); expect(cleanup).toHaveBeenCalledOnce();
    expect(network.mock.calls[0][1]!.signal!.aborted).toBe(true); expect(host.signal.aborted).toBe(false);
    await expect(stopGamePlay(session, launchId, host.signal)).resolves.toContain('remains pending');
    expect(network).toHaveBeenCalledTimes(2); expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it.each(['lost reply', 'refused', 'unsettled'])('keeps actual root Stop %s uncertain without retrying POST or acknowledging', async outcome => {
    const start = launchStartFixture(), entry = launchEntryFixture(start, 'original-start', 'service-run', await mazeManifestDigest(start.capabilities));
    network.mockResolvedValueOnce(new Response(JSON.stringify(entry)));
    const lost = new TypeError('Stop reply lost');
    if (outcome === 'lost reply') network.mockRejectedValueOnce(lost);
    else network.mockResolvedValueOnce(outcome === 'refused' ? new Response(null, { status: 503 })
      : new Response(JSON.stringify({ ...entry, stopRequested: true })));
    const result = stopGamePlay(session, launchId, host.signal);
    if (outcome === 'lost reply') await expect(result).rejects.toBe(lost);
    else if (outcome === 'refused') await expect(result).rejects.toThrow('Start Stop failed (503)');
    else await expect(result).resolves.toBe('Local play stopped. Service reconciliation remains pending.');
    expect(network).toHaveBeenCalledTimes(2);
    const [input, init] = network.mock.calls[1];
    expect(String(input)).toBe('http://127.0.0.1:5259/api/starts/stop'); expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ hostId: start.hostId, sessionId: start.sessionId,
      attemptId: entry.attemptId, runId: entry.runId, acceptedRequestHash: entry.acceptedRequestHash });
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ kind: 'retry', request: originalStop }, host.signal);
    expect(init!.signal!.aborted).toBe(true); expect(host.signal.aborted).toBe(false);
  });
});
