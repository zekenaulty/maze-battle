import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../game/GameSession';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { recoverGameNavigation } from './navigationRecovery';
import { binding, parentAction } from './pendingRecovery.test-support';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), read: vi.fn(), driver: vi.fn(), decision: vi.fn(),
  sdk: vi.fn(), sdkClose: vi.fn(), close: vi.fn(), cancel: vi.fn(), pulse: vi.fn(), ack: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch', () => ({ readLaunch: m.read }));
vi.mock('./operationDriver', () => ({ createGameOperationDriver: m.driver }));
vi.mock('./decisionCleanup', () => ({ decisionCleanup: m.decision }));
vi.mock('../sdk/agentica-host.mjs', async importOriginal => ({ ...await importOriginal<object>(),
  AgenticaHost: class { constructor(options: unknown) { m.sdk(options); } close = m.sdkClose; } }));

const fence: OwnerFence = { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1, revision: 25 };
const candidate: RecoveryCandidate = { operationId: 'travel-original', original: { key: 'original', id: 'record' }, binding };
const initial = () => ({ head: { ...fence }, value: { guard: { admissionAttemptId: 'admission', terminal: { disposition: 'cancelled' } },
  binding: { endpoint: 'ws://127.0.0.1:5259/api/host' } } });
const inspection = () => ({ action: { ...parentAction }, launchId: 'launch', operation: { terminal: {} },
  terminal: { event: { kind: 'cancelled' } }, decision: null as unknown });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
let host: AbortController, scope: AbortController, schema: AbortController, port: GameSession;
const fetchImpl = vi.fn<typeof fetch>();
const run = (action: 'stop' | 'reconcile' = 'reconcile') => recoverGameNavigation(port, fence, candidate, action, { signal: scope.signal, fetchImpl });

beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController(); scope = new AbortController(); schema = new AbortController();
  port = { owner: 'owner', get hostSignal() { return host.signal; }, cleanupHostOperation: vi.fn(async () => ({})),
    submitHostCommand: vi.fn() } as unknown as GameSession;
  m.database.mockImplementation(async (input: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>) => {
    const signal = AbortSignal.any([input, schema.signal]); signal.throwIfAborted();
    const result = await work(signal); signal.throwIfAborted(); return result;
  });
  m.inspect.mockImplementation(async () => inspection()); m.read.mockImplementation(async () => initial());
  m.driver.mockResolvedValue({ cancel: m.cancel, pulse: m.pulse, close: m.close });
  m.cancel.mockResolvedValue(undefined); m.pulse.mockResolvedValue({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  m.decision.mockReturnValue({ acknowledge: m.ack }); m.ack.mockResolvedValue({ status: 'navigation-acknowledged' });
  fetchImpl.mockResolvedValue(new Response('{}'));
});

describe('explicit original navigation recovery', () => {
  it('cancels through the shared driver without movement, network or ending GameSession', async () => {
    expect(await run('stop')).toEqual({ status: 'navigation-stopped' });
    expect(m.inspect).toHaveBeenCalledExactlyOnceWith(fence, candidate, { signal: expect.any(AbortSignal) });
    expect(m.cancel).toHaveBeenCalledOnce(); expect(m.pulse).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledOnce(); expect(m.sdkClose).toHaveBeenCalledOnce();
    expect(port.submitHostCommand).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
    expect(host.signal.aborted).toBe(false);
    const options = m.sdk.mock.calls[0][0]; expect(options.url).toBe(initial().value.binding.endpoint);
    for (const key of ['onAction', 'loadAction', 'saveAction']) await expect(options[key]({})).rejects.toThrow('cannot execute');
    await expect(m.driver.mock.calls[0][0].submitHostCommand({})).rejects.toThrow('cannot execute');
  });

  it('delivers one terminal pulse, never an implicit retry loop', async () => {
    m.pulse.mockResolvedValue({ status: 'terminal-prefix-delivered', sequence: 4 });
    expect(await run()).toEqual({ status: 'terminal-prefix-delivered', sequence: 4 });
    expect(m.pulse).toHaveBeenCalledOnce(); expect(m.cancel).not.toHaveBeenCalled(); expect(m.decision).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledOnce();
  });

  it('uses the retained decision cleanup for a decision original without constructing a controller or driver', async () => {
    m.inspect.mockResolvedValue({ ...inspection(), terminal: { event: { kind: 'decision' } }, decision: { retained: true }, claim: {} });
    expect(await run()).toEqual({ status: 'navigation-acknowledged' });
    expect(m.ack).toHaveBeenCalledOnce(); expect(m.driver).not.toHaveBeenCalled(); expect(m.sdkClose).toHaveBeenCalledOnce();
  });

  it.each([false, true])('routes an unclaimed intention by verified root acknowledgement (%s)', async acknowledged => {
    m.inspect.mockResolvedValue({ ...inspection(), terminal: { event: { kind: 'decision' } }, decision: { retained: true } });
    if (acknowledged) m.read.mockResolvedValue({ ...initial(), value: { ...initial().value,
      guard: { ...initial().value.guard, state: 'acknowledged' } } });
    await run();
    expect(acknowledged ? m.ack : m.pulse).toHaveBeenCalledOnce();
    expect(acknowledged ? m.pulse : m.ack).not.toHaveBeenCalled();
  });

  it.each(['unfinished', 'root-running', 'root-changed', 'other-owner'])('refuses %s before constructing transport helpers', async reason => {
    if (reason === 'unfinished') m.inspect.mockResolvedValue({ ...inspection(), operation: {} });
    if (reason === 'root-running') m.read.mockResolvedValue({ ...initial(), value: { ...initial().value, guard: { admissionAttemptId: 'admission' } } });
    if (reason === 'root-changed') m.read.mockResolvedValue({ ...initial(), head: { ...fence, revision: 26 } });
    if (reason === 'other-owner') port = { ...port, owner: 'other' } as GameSession;
    await expect(run()).rejects.toThrow();
    expect(m.sdk).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('holds the existing schema before every ordinary read', async () => {
    m.database.mockRejectedValue(new Error('No current schema; no upgrade performed.'));
    await expect(run()).rejects.toThrow('No current schema');
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['scope', 'schema', 'lifetime'])('rejects a late inspection after %s changes', async kind => {
    const pending = deferred<ReturnType<typeof inspection>>(); m.inspect.mockReturnValue(pending.promise);
    const result = run(); const rejection = expect(result).rejects.toThrow();
    if (kind === 'scope') scope.abort(); else if (kind === 'schema') schema.abort(); else host = new AbortController();
    pending.resolve(inspection()); await rejection;
    expect(m.read).not.toHaveBeenCalled(); expect(m.sdk).not.toHaveBeenCalled();
  });

  it('captures the fence and candidate before the first await', async () => {
    const expected = structuredClone(fence), target = structuredClone(candidate), pending = deferred<ReturnType<typeof inspection>>();
    m.inspect.mockReturnValue(pending.promise);
    const result = recoverGameNavigation(port, expected, target, 'stop');
    expected.owner = 'changed'; target.original.id = 'changed'; target.binding.grant.id = 'changed';
    pending.resolve(inspection()); await result;
    expect(m.inspect.mock.calls[0][0]).toEqual(fence); expect(m.inspect.mock.calls[0][1]).toEqual(candidate);
    expect(m.driver.mock.calls[0][3]).toEqual(candidate.binding);
  });

  it('closes a late driver after dismissal without calling it', async () => {
    const pending = deferred<unknown>(); m.driver.mockImplementation(async () => { scope.abort(); return pending.promise; });
    const result = run('stop'); const rejection = expect(result).rejects.toThrow();
    pending.resolve({ cancel: m.cancel, pulse: m.pulse, close: m.close }); await rejection;
    expect(m.close).toHaveBeenCalledOnce(); expect(m.sdkClose).toHaveBeenCalled(); expect(m.cancel).not.toHaveBeenCalled();
  });

  it('rechecks custody before HTTP and refuses a takeover without contacting the service', async () => {
    m.read.mockResolvedValueOnce(initial()).mockResolvedValue({ ...initial(), head: { ...fence, epoch: 2 } });
    m.driver.mockImplementation(async (_port, _sdk, _action, _binding, network: typeof fetch) => ({
      close: m.close, pulse: async () => { await network('http://127.0.0.1:5259/api/operations'); }, cancel: m.cancel,
    }));
    await expect(run()).rejects.toThrow('custody changed'); expect(fetchImpl).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledOnce();
  });

  it('aborts HTTP on schema change and never accepts a late response', async () => {
    let requestSignal: AbortSignal | undefined;
    fetchImpl.mockImplementation(async (_url, init) => { requestSignal = init!.signal!; schema.abort(); return new Response('{}'); });
    m.driver.mockImplementation(async (_port, _sdk, _action, _binding, network: typeof fetch) => ({
      close: m.close, pulse: async () => { await network('http://127.0.0.1:5259/api/operations'); }, cancel: m.cancel,
    }));
    await expect(run()).rejects.toThrow(); expect(requestSignal!.aborted).toBe(true); expect(m.close).toHaveBeenCalled();
    expect(port.cleanupHostOperation).not.toHaveBeenCalled();
  });

  it('guards the same cleanup port without creating a second writer', async () => {
    const command = { kind: 'cancel', target: { generation: 'generation', gameId: 'game', operationId: 'root' } };
    m.driver.mockImplementation(async guarded => ({ close: m.close, pulse: m.pulse,
      cancel: async () => { await guarded.cleanupHostOperation(command, host.signal); } }));
    await run('stop'); expect(port.cleanupHostOperation).toHaveBeenCalledExactlyOnceWith(command, host.signal);
    expect(port.submitHostCommand).not.toHaveBeenCalled();
  });

  it('refuses network from the local Stop path even if a driver attempted it', async () => {
    m.driver.mockImplementation(async (_port, _sdk, _action, _binding, network: typeof fetch) => ({
      close: m.close, pulse: m.pulse, cancel: () => network('http://127.0.0.1:5259/api/operations'),
    }));
    await expect(run('stop')).rejects.toThrow('local navigation Stop cannot contact'); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
