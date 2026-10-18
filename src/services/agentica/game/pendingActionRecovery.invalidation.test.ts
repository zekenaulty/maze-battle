// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidate, descriptor, fence, inspectGamePendingAction, listGamePendingActions, page,
  reconcileGamePendingAction, remoteEntry, reply, response, setup, view } from './pendingActionRecovery.test-support';
import { isPendingRecoveryInvalidated, PendingRecoveryInvalidatedError } from './pendingActionRecovery';
import { recoverPregrantAction } from './pendingRecovery';
import { binding, parentAction, pendingAction } from './pendingRecovery.test-support';

const m = vi.hoisted(() => ({ database: vi.fn(), inspect: vi.fn(), decision: vi.fn(), stop: vi.fn(), proof: vi.fn(), sdk: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: m.database }));
vi.mock('../../../persistence/canonical/agentica/recovery', () => ({ inspectAgenticaRecovery: m.inspect }));
vi.mock('../../../persistence/canonical/agentica/launch.terminal', () => ({ readLaunchTerminal: m.stop }));
vi.mock('./decisionState', () => ({ decisionState: m.decision }));
vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: m.proof }));

let s: ReturnType<typeof setup>;
beforeEach(() => { s = setup(m); });
const list = () => listGamePendingActions(s.port, fence, candidate, s.options);
const inspect = () => inspectGamePendingAction(s.port, fence, candidate, descriptor(), s.options);
const direct = () => recoverPregrantAction(s.port, parentAction, binding, pendingAction, { ...s.options, expectedFence: fence });

describe('typed local custody invalidation without disguising uncertain transport', () => {
  it.each(['root', 'claim', 'fence'])('classifies changed %s after the HTTP response and discards the page', async kind => {
    s.http.mockImplementation(async () => {
      const current = view();
      if (kind === 'root') current.value.terminal.bound.active.id = 'other';
      if (kind === 'claim') current.value.claim.data.started.runId = 'other';
      if (kind === 'fence') current.head.revision++;
      m.decision.mockResolvedValue(current); return response(page());
    });
    await expect(list()).rejects.toBeInstanceOf(PendingRecoveryInvalidatedError); expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('classifies ownership loss before reads without contacting the service', async () => {
    Object.defineProperty(s.port, 'owner', { value: 'other' });
    await expect(list()).rejects.toBeInstanceOf(PendingRecoveryInvalidatedError); expect(s.http).not.toHaveBeenCalled();
  });
  it('classifies failure to hold the schema before any local reader or HTTP', async () => {
    const cause = new Error('No current schema'); m.database.mockRejectedValueOnce(cause);
    await expect(list()).rejects.toMatchObject({ name: 'PendingRecoveryInvalidatedError', cause });
    expect(m.inspect).not.toHaveBeenCalled(); expect(s.http).not.toHaveBeenCalled();
  });
  it('classifies schema invalidation during HTTP when the guard supplies the abort reason', async () => {
    const cause = new Error('Schema changed');
    s.http.mockImplementation(async () => { s.state.schema.abort(cause); return response(page()); });
    await expect(list()).rejects.toMatchObject({ name: 'PendingRecoveryInvalidatedError', cause });
  });
  it.each(['inspect', 'reconcile'])('classifies local proof failure during %s', async kind => {
    s.http.mockResolvedValue(response(remoteEntry()));
    const selection = kind === 'reconcile' ? await inspect() : undefined;
    const cause = new Error('Local successor grant appeared'); m.proof.mockRejectedValueOnce(cause);
    await expect(selection ? reconcileGamePendingAction(s.port, fence, candidate, selection, s.options) : inspect())
      .rejects.toMatchObject({ name: 'PendingRecoveryInvalidatedError', cause });
    expect(s.http.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });
  it.each(['scope', 'host'] as const)('leaves %s cancellation untyped', async kind => {
    const cause = new Error('Scope ended');
    s.http.mockImplementation(async () => { s.state[kind].abort(cause); return response(page()); });
    await expect(list()).rejects.toBe(cause); expect(isPendingRecoveryInvalidated(cause)).toBe(false);
  });
  it('preserves the exact transport timeout instead of treating it as local invalidation', async () => {
    const timeout = new DOMException('Deadline expired', 'TimeoutError'); s.http.mockRejectedValueOnce(timeout);
    await expect(list()).rejects.toBe(timeout); expect(isPendingRecoveryInvalidated(timeout)).toBe(false);
    expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('preserves an HTTP refusal and its service code without marking custody stale', async () => {
    s.http.mockResolvedValue(response({ code: 'custody.unavailable', message: 'Temporarily unavailable' }, 409));
    const error = await list().catch(e => e);
    expect(error.code).toBe('custody.unavailable'); expect(isPendingRecoveryInvalidated(error)).toBe(false);
    expect(s.http).toHaveBeenCalledTimes(1);
  });
  it('leaves malformed remote descriptors untyped, without blaming local custody', async () => {
    s.http.mockResolvedValue(response({ ...page(), runId: 'foreign' }));
    const error = await list().catch(e => e);
    expect(error).toBeInstanceOf(Error); expect(isPendingRecoveryInvalidated(error)).toBe(false);
  });
  it('leaves a lost POST reply untyped and permits only an explicit exact retry', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect();
    const lost = new Error('Accepted POST reply lost');
    s.http.mockResolvedValueOnce(response(remoteEntry())).mockRejectedValueOnce(lost);
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toBe(lost);
    expect(isPendingRecoveryInvalidated(lost)).toBe(false); expect(s.http).toHaveBeenCalledTimes(3);
    s.http.mockResolvedValueOnce(response(remoteEntry(true))).mockResolvedValueOnce(response(reply(true))).mockResolvedValueOnce(response(remoteEntry(true)));
    expect((await reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).duplicate).toBe(true);
    expect(s.http.mock.calls[2][1]!.body).toBe(s.http.mock.calls[4][1]!.body);
  });
  it('preserves lost POST uncertainty even if schema invalidation occurs at the same time', async () => {
    s.http.mockResolvedValueOnce(response(remoteEntry())); const selection = await inspect(), lost = new Error('Reply lost');
    s.http.mockResolvedValueOnce(response(remoteEntry())).mockImplementationOnce(async () => {
      s.state.schema.abort(new Error('Schema changed concurrently')); throw lost;
    });
    await expect(reconcileGamePendingAction(s.port, fence, candidate, selection, s.options)).rejects.toBe(lost);
    expect(isPendingRecoveryInvalidated(lost)).toBe(false); expect(s.http).toHaveBeenCalledTimes(3);
  });
  it.each(['read', 'fence', 'proof'])('classifies the existing pregrant composition local %s failure', async kind => {
    const cause = new Error('Local canonical evidence changed');
    if (kind === 'read') m.decision.mockRejectedValueOnce(cause);
    if (kind === 'fence') m.decision.mockResolvedValue({ ...view(), head: { ...fence, revision: fence.revision + 1 } });
    if (kind === 'proof') m.proof.mockRejectedValueOnce(cause);
    await expect(direct()).rejects.toBeInstanceOf(PendingRecoveryInvalidatedError); expect(s.http).not.toHaveBeenCalled();
  });
});
