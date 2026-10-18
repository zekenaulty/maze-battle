// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidate, createGamePendingRecovery, deferred, descriptor, detail, fence, inspectGamePendingAction,
  listGamePendingActions, page, reconcileGamePendingAction, remoteEntry, reply, response, setup, stop, view } from './pendingActionRecovery.test-support';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), decision: vi.fn(), stop: vi.fn(), proof: vi.fn(), sdk: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch.terminal', () => ({ readLaunchTerminal: m.stop }));
vi.mock('./decisionState', () => ({ decisionState: m.decision }));
vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: m.proof }));
vi.mock('../sdk/agentica-host.mjs', async original => ({ ...await original<object>(),
  AgenticaHost: class { constructor() { m.sdk(); throw new Error('SDK lifecycle forbidden'); } } }));

let s: ReturnType<typeof setup>;
beforeEach(() => { s = setup(m); });
const list = () => listGamePendingActions(s.port, fence, candidate, s.options);
const inspect = () => inspectGamePendingAction(s.port, fence, candidate, descriptor(), s.options);

describe('pending recovery scope and custody guards', () => {
  it.each(['owner', 'fence', 'claim', 'grant', 'root', 'stop', 'cancellation'])('refuses changed %s before HTTP', async kind => {
    const current = view();
    if (kind === 'owner') Object.defineProperty(s.port, 'owner', { value: 'other' });
    if (kind === 'fence') current.head.revision++;
    if (kind === 'claim') m.inspect.mockResolvedValue({ ...detail(), claim: null });
    if (kind === 'grant') current.value.grant = {};
    if (kind === 'root') current.value.terminal.bound.active.id = 'other';
    if (kind === 'stop') current.value.terminal.bound.launch.guard.terminal.disposition = 'completed';
    if (kind === 'cancellation') m.stop.mockResolvedValue({ ...stop(), value: { ...stop().value, admissionAttemptId: 'other' } });
    m.decision.mockResolvedValue(current);
    await expect(list()).rejects.toThrow(); expect(s.http).not.toHaveBeenCalled();
  });
  it('holds the existing schema before inspection or any ordinary reader', async () => {
    m.database.mockRejectedValue(new Error('Missing or obsolete schema; no upgrade'));
    await expect(list()).rejects.toThrow('no upgrade'); expect(m.inspect).not.toHaveBeenCalled();
    expect(m.decision).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled(); expect(s.http).not.toHaveBeenCalled();
  });
  it.each(['scope', 'host', 'schema', 'replacement', 'owner'])('rejects a late local read after %s invalidation', async kind => {
    const pending = deferred<ReturnType<typeof detail>>(); m.inspect.mockReturnValue(pending.promise);
    const result = list(), rejected = expect(result).rejects.toThrow();
    if (kind === 'scope') s.state.scope.abort();
    if (kind === 'host') s.state.host.abort();
    if (kind === 'schema') s.state.schema.abort();
    if (kind === 'replacement') s.state.host = new AbortController();
    if (kind === 'owner') Object.defineProperty(s.port, 'owner', { value: 'other' });
    pending.resolve(detail()); await rejected; expect(m.decision).not.toHaveBeenCalled(); expect(s.http).not.toHaveBeenCalled();
  });
  it.each(['scope', 'host', 'schema', 'owner', 'revision', 'root', 'claim'])('rejects a late HTTP page after %s changes', async kind => {
    s.http.mockImplementation(async (_url, init) => {
      if (kind === 'scope') s.state.scope.abort();
      if (kind === 'host') s.state.host.abort();
      if (kind === 'schema') s.state.schema.abort();
      if (kind === 'owner') Object.defineProperty(s.port, 'owner', { value: 'other' });
      const current = view();
      if (kind === 'revision') current.head.revision++;
      if (kind === 'root') current.value.terminal.bound.active.id = 'other';
      if (kind === 'claim') current.value.claim.data.started.runId = 'other';
      m.decision.mockResolvedValue(current);
      if (['scope', 'host', 'schema'].includes(kind)) expect(init!.signal!.aborted).toBe(true);
      return response(page());
    });
    await expect(list()).rejects.toThrow(); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('refuses a takeover between initial inspection and dispatch', async () => {
    m.decision.mockResolvedValueOnce(view()).mockResolvedValue({ ...view(), head: { ...fence, epoch: fence.epoch + 1 } });
    await expect(list()).rejects.toThrow('fence changed'); expect(s.http).not.toHaveBeenCalled();
  });
  it('captures caller fence, candidate and descriptor before asynchronous reads', async () => {
    const inputFence = structuredClone(fence), input = structuredClone(candidate), selected = descriptor();
    s.http.mockResolvedValue(response(remoteEntry()));
    const result = inspectGamePendingAction(s.port, inputFence, input, selected, s.options);
    inputFence.owner = 'other'; input.original.id = 'other'; selected.actionId = 'other';
    expect((await result).action.actionId).toBe('pending');
    expect(m.inspect.mock.calls[0][0]).toEqual(fence); expect(m.inspect.mock.calls[0][1]).toEqual(candidate);
  });
  it('does not read or contact anything at handle creation; close does not end GameSession', async () => {
    const handle = createGamePendingRecovery(s.port, fence, candidate, s.options);
    expect(m.database).not.toHaveBeenCalled(); handle.close();
    await expect(handle.list()).rejects.toThrow('closed'); expect(s.state.host.signal.aborted).toBe(false);
  });
  it('serializes handle operations and rejects duplicate clicks without queuing', async () => {
    const pending = deferred<Response>(), entered = deferred<void>();
    s.http.mockImplementation(async () => { entered.resolve(); return pending.promise; });
    const handle = createGamePendingRecovery(s.port, fence, candidate, s.options), first = handle.list();
    await entered.promise; await expect(handle.list()).rejects.toThrow('already running');
    pending.resolve(response(page())); await first; expect(s.http).toHaveBeenCalledTimes(1); handle.close();
  });
  it('serializes the stateless entry points for the same controller and releases the lock on failure', async () => {
    const pending = deferred<Response>(), entered = deferred<void>();
    s.http.mockImplementationOnce(async () => { entered.resolve(); return pending.promise; });
    const first = list(), rejected = expect(first).rejects.toThrow('missing');
    await entered.promise; await expect(inspect()).rejects.toThrow('already running');
    pending.resolve(response({ code: 'missing', message: 'missing' }, 409)); await rejected;
    await list(); expect(s.http).toHaveBeenCalledTimes(2);
  });
  it('close aborts an active request and discards its late reply', async () => {
    const handle = createGamePendingRecovery(s.port, fence, candidate, s.options);
    s.http.mockImplementation(async (_url, init) => { handle.close(); expect(init!.signal!.aborted).toBe(true); return response(page()); });
    await expect(handle.list()).rejects.toThrow('closed'); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it.each(['header', 'stream'])('bounds %s response bytes before JSON interpretation', async kind => {
    s.http.mockResolvedValue(kind === 'header' ? new Response('{}', { headers: { 'content-length': '4194305' } })
      : new Response('x'.repeat(4194305)));
    await expect(list()).rejects.toThrow('bounded inventory size'); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('rejects no-effect proof failure without POST and remains usable after a network error', async () => {
    s.http.mockRejectedValueOnce(new Error('offline'));
    await expect(list()).rejects.toThrow('offline'); await list();
    s.http.mockResolvedValue(response(remoteEntry())); m.proof.mockRejectedValue(new Error('successor granted'));
    await expect(inspect()).rejects.toThrow('successor granted'); expect(s.http.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });
  it('revalidates after proof and refuses a raced POST', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    m.proof.mockImplementationOnce(async () => { s.state.scope.abort(); throw new Error('closed'); });
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toThrow();
    expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('does not accept or retry a successful POST after scope dismissal', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    s.http.mockResolvedValueOnce(response(remoteEntry())).mockImplementationOnce(async () => {
      s.state.scope.abort(); return response(reply());
    });
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toThrow();
    expect(s.http).toHaveBeenCalledTimes(3);
  });
});
