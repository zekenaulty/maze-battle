// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindAgenticaRun, executeAgenticaAction, loadAgenticaAction, loadAgenticaRun, saveAgenticaAction } from '../../persistence/agenticaRepository';
import { claimStreamControl, loadStreamControl } from '../../persistence/streamRepository';
import { openAgenticaClient, type AgenticaClient, type AgenticaClientOptions } from './client';
import { deferred } from './clientPolicy';
import { clientFixture, FixtureSocket } from './client.testSupport';

vi.mock('../../persistence/agenticaRepository', () => ({ bindAgenticaRun: vi.fn(), executeAgenticaAction: vi.fn(),
  loadAgenticaRun: vi.fn(), loadAgenticaAction: vi.fn(), saveAgenticaAction: vi.fn(), reconcileAgenticaAction: vi.fn() }));
vi.mock('../../persistence/streamRepository', () => ({ claimStreamControl: vi.fn(), loadStreamControl: vi.fn(), loadStreamSnapshot: vi.fn() }));
vi.mock('../../persistence/streamPublicScope', () => ({ ensureStreamPublicScope: vi.fn(), getStreamPublicScope: vi.fn() }));

let clients: AgenticaClient[];
beforeEach(() => { vi.resetAllMocks(); clients = []; });
afterEach(async () => { await Promise.all(clients.map(client => client.close().catch(() => undefined))); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function client(options: Partial<AgenticaClientOptions> = {}) {
  const value = openAgenticaClient({ slot: 'sdk-test', url: 'ws://127.0.0.1:5079/api/host', objective: 'first-chest', ...options });
  clients.push(value); return value;
}

describe('Agentica fixture client using the vendored SDK', () => {
  it.each(['wss://localhost:5079/api/host', 'ws://example.com/api/host', 'ws://localhost.evil/api/host',
    'ws://user@localhost/api/host', 'ws://localhost/api/host?provider=openai', 'ws://localhost/elsewhere'])('rejects unsafe endpoint %s before ownership', url => {
    clientFixture(); expect(() => client({ url })).toThrow(); expect(claimStreamControl).not.toHaveBeenCalled();
  });

  it('starts once with only public observed evidence, fixed fixture provider, and a stable objective identity', async () => {
    const f = clientFixture(); const host = client();
    const [first, duplicate] = await Promise.all([host.start(), host.start()]);
    expect(first).toEqual(duplicate); expect(bindAgenticaRun).toHaveBeenCalledTimes(1);
    const request = FixtureSocket.instances[0].sent.find(message => message.type === 'start')!.payload;
    expect(request).toMatchObject({ protocolVersion: 1, sessionId: f.local.binding.scopeId,
      objectiveId: `${f.local.binding.scopeId}:first-chest`, provider: { provider: 'fixture', model: 'fixture-model',
        contextWindowTokens: 131072, maxOutputTokens: 4096 } });
    expect(request.capabilities).toHaveLength(5);
    expect(JSON.stringify(request.observation)).not.toMatch(/20261008|spaces-v2|recipe/);
    expect(new TextEncoder().encode(JSON.stringify(request.observation)).length).toBeLessThanOrEqual(65536);
    expect(host.currentRun).toEqual(first); first.manifestHash = 'changed';
    expect(host.currentRun?.manifestHash).not.toBe('changed');
    expect((await host.start()).manifestHash).not.toBe('changed');
    await host.cancel();
    const next = await client().start(); expect(next.objectiveId).toBe(duplicate.objectiveId);
    expect(next.sessionEpoch).not.toBe(duplicate.sessionEpoch);
  });

  it('holds SDK load/reservation/execution until started binding commits, even with an immediate action', async () => {
    const f = clientFixture(); const host = client(); const entered = deferred<void>(); const gate = deferred<void>();
    const bind = vi.mocked(bindAgenticaRun).getMockImplementation()!;
    vi.mocked(bindAgenticaRun).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return bind(...args); });
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => { send(message, socket); if (message.type === 'start') f.sendAction(f.action(), 'action.request', socket); };
    const pending = host.start(); await entered.promise;
    expect(loadAgenticaAction).not.toHaveBeenCalled(); expect(saveAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
    gate.resolve(); await pending;
    expect(await f.result()).toMatchObject({ disposition: 'applied' });
    expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('never reserves or executes when durable run binding fails', async () => {
    const f = clientFixture(); const host = client(); vi.mocked(bindAgenticaRun).mockRejectedValue(new Error('Quota'));
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => { send(message, socket); if (message.type === 'start') f.sendAction(); };
    await expect(host.start()).rejects.toThrow('start failed');
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(saveAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it.each(['sessionId', 'sessionEpoch', 'scopeId', 'objectiveId', 'manifestHash'] as const)('rejects changed service %s before binding', async field => {
    const f = clientFixture(); const host = client();
    FixtureSocket.onSend = (message, socket) => {
      if (message.type === 'start') socket.reply(message, 'started', { ...f.started(message.payload), [field]: 'wrong' }, 'service-run');
    };
    await expect(host.start()).rejects.toThrow(); expect(bindAgenticaRun).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('rejects an action with a different manifest without reserving it', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    f.sendAction({ ...f.action(), manifestHash: `sha256:${'b'.repeat(64)}` });
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(saveAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('preserves pending custody and does not execute after reservation failure', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    vi.mocked(saveAgenticaAction).mockRejectedValue(new Error('Quota'));
    f.sendAction(); expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('fences on manual takeover and still returns the exact original observation on replay', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const first = f.sendAction(); const original = await f.result();
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    f.sendAction(f.action(undefined, 'late')); expect(await f.result('late')).toMatchObject({ disposition: 'unresolved' });
    f.sendAction(first, 'action.reconcile');
    await vi.waitFor(() => expect(FixtureSocket.instances[0].sent.filter(value => value.type === 'action.result' && value.payload.actionId === first.actionId)).toHaveLength(2));
    expect(await f.result()).toEqual(original); expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
    expect(f.state.control.sessionId).toBe('human-now');
  });

  it('reconciles a same-client late commit instead of retaining a cached unresolved result', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const execute = vi.mocked(executeAgenticaAction).getMockImplementation()!; const gate = deferred<void>();
    let late!: Promise<unknown>;
    vi.mocked(executeAgenticaAction).mockImplementation((...args) => {
      late = gate.promise.then(() => execute(...args)); return Promise.reject(new Error('Acknowledgement unknown'));
    });
    const action = f.sendAction(); expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    gate.resolve(); await late;
    const original = await host.reconcile(action); expect(original?.disposition).toBe('applied');
    f.sendAction(action, 'action.reconcile');
    await vi.waitFor(() => expect(FixtureSocket.instances[0].sent.filter(value => value.type === 'action.result')).toHaveLength(2));
    expect(await f.result()).toEqual(original); expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('cancels domain ownership before SDK stop and never executes a pending reservation afterward', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const save = vi.mocked(saveAgenticaAction).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(saveAgenticaAction).mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return save(...args); });
    const owner = { ...f.state.control }; f.sendAction(); await entered.promise;
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => { if (message.type === 'cancel') expect(f.state.control.epoch).toBe(owner.epoch + 1); send(message, socket); };
    await host.cancel(); gate.resolve();
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' }); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it.each(['outcome', 'run.terminated'])('handles %s as terminal without permitting queued new effects', async type => {
    const f = clientFixture(); const host = client(); await host.start();
    FixtureSocket.instances[0].receive(type, { status: 'failed' }, { runId: 'service-run' });
    f.sendAction(); expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(host.status).toBe(type); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('reconnects the saved run in a new client without claiming another epoch or rerunning an action', async () => {
    const f = clientFixture(); const first = client(); const binding = await first.start();
    const action = f.sendAction(); const original = await f.result(); FixtureSocket.instances[0].close();
    const claims = vi.mocked(claimStreamControl).mock.calls.length;
    const second = client(); await second.reconnect(binding.runId);
    expect(second.currentRun).toEqual(binding); expect(claimStreamControl).toHaveBeenCalledTimes(claims);
    f.sendAction(action, 'action.reconcile'); expect(await f.result()).toEqual(original);
    expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('checks ownership again after asynchronous reads and never manufactures a replacement action', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const read = vi.mocked(loadStreamControl).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(loadStreamControl).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return read(...args); });
    f.sendAction(); await entered.promise;
    f.state.control = { sessionId: 'human', epoch: f.state.control.epoch + 1 }; gate.resolve();
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' }); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('finishes cancellation across an outstanding ownership claim without starting a service run', async () => {
    const f = clientFixture(); const host = client(); const entered = deferred<void>(); const gate = deferred<void>();
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return claim(...args); });
    const starting = host.start(); const rejected = expect(starting).rejects.toThrow(); await entered.promise;
    const cancelled = host.cancel(); gate.resolve(); await cancelled; await rejected;
    expect(f.state.control.epoch).toBe(12);
    expect(FixtureSocket.instances[0].sent.some(message => message.type === 'start')).toBe(false);
    expect(bindAgenticaRun).not.toHaveBeenCalled();
  });

  it('stops a late started run once after cancellation without binding or executing it', async () => {
    const f = clientFixture(); const host = client(); const entered = deferred<void>();
    let respond!: () => void; const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => {
      if (message.type === 'start') { respond = () => send(message, socket); entered.resolve(); }
      else send(message, socket);
    };
    const starting = host.start(); const rejected = expect(starting).rejects.toThrow(); await entered.promise;
    await host.cancel(); respond(); await rejected;
    expect(FixtureSocket.instances[0].sent.filter(message => message.type === 'cancel')).toHaveLength(1);
    expect(bindAgenticaRun).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
    expect(f.state.control.epoch).toBe(12);
  });

  it('does not admit early actions when cancellation races the durable binding acknowledgement', async () => {
    const f = clientFixture(); const host = client(); const entered = deferred<void>(); const gate = deferred<void>();
    const bind = vi.mocked(bindAgenticaRun).getMockImplementation()!;
    vi.mocked(bindAgenticaRun).mockImplementation(async (...args) => { await bind(...args); entered.resolve(); await gate.promise; });
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => { send(message, socket); if (message.type === 'start') f.sendAction(); };
    const starting = host.start(); const rejected = expect(starting).rejects.toThrow(); await entered.promise;
    await host.cancel(); gate.resolve(); await rejected;
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(f.runs.size).toBe(1); expect(executeAgenticaAction).not.toHaveBeenCalled();
    expect(FixtureSocket.instances[0].sent.filter(message => message.type === 'cancel')).toHaveLength(1);
  });

  it.each(['outcome', 'run.terminated'])('retains a started binding even when %s arrives before binding is ready', async type => {
    const f = clientFixture(); const host = client(); const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => {
      send(message, socket);
      if (message.type === 'start') socket.receive(type, { status: 'failed' }, { runId: 'service-run' });
    };
    await host.start(); expect(f.runs.size).toBe(1); expect(host.status).toBe(type);
    expect(f.state.control.epoch).toBe(12); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('does not accept another envelope type as the started response', async () => {
    const f = clientFixture(); const host = client();
    FixtureSocket.onSend = (message, socket) => {
      if (message.type === 'start') socket.reply(message, 'progress', f.started(message.payload), 'service-run');
    };
    await expect(host.start()).rejects.toThrow(); expect(bindAgenticaRun).not.toHaveBeenCalled();
  });

  it('holds resumed actions until the saved service manifest is revalidated', async () => {
    const f = clientFixture(); const host = client(); await host.start(); FixtureSocket.instances[0].close();
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => {
      if (message.type === 'resume') {
        socket.reply(message, 'resumed', { ...f.state.started, manifestHash: `sha256:${'b'.repeat(64)}` }, 'service-run');
        f.sendAction(f.action(), 'action.request', socket);
      } else send(message, socket);
    };
    await expect(host.reconnect()).rejects.toThrow();
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' });
    expect(saveAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('never opens a replacement socket after close races a reloaded binding read', async () => {
    const f = clientFixture(); const first = client(); const binding = await first.start(); FixtureSocket.instances[0].close();
    const read = vi.mocked(loadAgenticaRun).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(loadAgenticaRun).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return read(...args); });
    const next = client(); const pending = next.reconnect(binding.runId); const rejected = expect(pending).rejects.toThrow();
    await entered.promise; const closed = next.close(); gate.resolve(); await closed; await rejected;
    expect(FixtureSocket.instances).toHaveLength(1); expect(next.status).toBe('closed');
    expect(f.state.control.epoch).toBe(12);
  });

  it('recovers retained original evidence through the SDK recovery path without executing again', async () => {
    const f = clientFixture(); const host = client(); const binding = await host.start();
    const action = f.sendAction(); const original = await f.result();
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'POST'
      ? { actionId: action.actionId, resolved: true } : [{ hostId: 'maze-battle', sessionId: binding.sessionId,
        sessionEpoch: binding.sessionEpoch, runId: binding.runId, request: action }]), { status: 200 }));
    vi.stubGlobal('fetch', fetch); const recovered = await host.reconcile();
    expect(recovered[0]).toMatchObject({ actionId: action.actionId, resolved: true });
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string).result).toEqual(original);
    expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('does not execute an action that expires while its reservation is being persisted', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const save = vi.mocked(saveAgenticaAction).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(saveAgenticaAction).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return save(...args); });
    const action = f.sendAction(); await entered.promise;
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(action.deadlineAt) + 1); gate.resolve();
    expect(await f.result()).toMatchObject({ disposition: 'unresolved' }); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('keeps the exact reconciliation request when its caller mutates the original during a read', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const action = f.sendAction(); const original = await f.result();
    const read = vi.mocked(loadAgenticaRun).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(loadAgenticaRun).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return read(...args); });
    const pending = host.reconcile(action); await entered.promise;
    action.actionId = 'changed'; action.arguments.direction = 'south'; gate.resolve();
    expect(await pending).toEqual(original); expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it.each(['load', 'save'])('does not disclose private repository error text from the SDK %s hook', async stage => {
    const f = clientFixture(); const host = client(); await host.start();
    const error = new Error(`Private recipe ${f.local.world.checkpoint.scopeId}`);
    if (stage === 'load') vi.mocked(loadAgenticaAction).mockRejectedValue(error);
    else vi.mocked(saveAgenticaAction).mockRejectedValue(error);
    f.sendAction(); const result = await f.result();
    expect(result.disposition).toBe('unresolved');
    expect(JSON.stringify(result)).not.toMatch(/20261008|recipe|spaces-v2/);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('coalesces reentrant start, cancel, and close calls from status observers', async () => {
    clientFixture();
    const nested: Promise<unknown>[] = [];
    const host = client({ onStatus: status => {
      if (status.state === 'starting') nested.push(host.start());
      if (status.state === 'cancelling') nested.push(host.cancel());
      if (status.state === 'closed') nested.push(host.close());
    } });
    await host.start(); await host.cancel(); await host.close(); await Promise.all(nested);
    expect(FixtureSocket.instances).toHaveLength(1);
    expect(FixtureSocket.instances[0].sent.map(message => message.type)).toEqual(['start', 'cancel']);
    expect(claimStreamControl).toHaveBeenCalledTimes(2);
  });

  it('keeps closed status when an outstanding SDK stop later rejects on disconnect', async () => {
    clientFixture(); const host = client(); await host.start(); const entered = deferred<void>();
    FixtureSocket.onSend = message => { if (message.type === 'cancel') entered.resolve(); };
    const cancelled = host.cancel(); const rejected = expect(cancelled).rejects.toThrow();
    await entered.promise; await host.close(); await rejected;
    expect(host.status).toBe('closed'); await host.cancel(); expect(host.status).toBe('closed');
  });
});
