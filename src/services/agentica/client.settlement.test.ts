// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAgenticaAction, reconcileAgenticaAction, saveAgenticaAction, settleAgenticaAction } from '../../persistence/agenticaRepository';
import { claimStreamControl } from '../../persistence/streamRepository';
import { openAgenticaClient, type AgenticaClient } from './client';
import { deferred } from './clientPolicy';
import { clientFixture, FixtureSocket } from './client.testSupport';
import { actionFingerprint, actionKey } from './sdk/agentica-host.mjs';

vi.mock('../../persistence/agenticaRepository', () => ({ bindAgenticaRun: vi.fn(), executeAgenticaAction: vi.fn(),
  loadAgenticaRun: vi.fn(), loadAgenticaAction: vi.fn(), saveAgenticaAction: vi.fn(), reconcileAgenticaAction: vi.fn(), settleAgenticaAction: vi.fn() }));
vi.mock('../../persistence/streamRepository', () => ({ claimStreamControl: vi.fn(), loadStreamControl: vi.fn(), loadStreamSnapshot: vi.fn() }));
vi.mock('../../persistence/streamPublicScope', () => ({ ensureStreamPublicScope: vi.fn(), getStreamPublicScope: vi.fn() }));

let clients: AgenticaClient[];
beforeEach(() => { vi.resetAllMocks(); clients = []; });
afterEach(async () => { await Promise.all(clients.map(client => client.close().catch(() => undefined))); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function client() {
  const value = openAgenticaClient({ slot: 'sdk-test', url: 'ws://127.0.0.1:5079/api/host', objective: 'first-chest' });
  clients.push(value); return value;
}
function reserve(f: ReturnType<typeof clientFixture>) {
  const action = f.action();
  f.records.set(actionKey(action), { status: 'pending', fingerprint: actionFingerprint(action) });
  return action;
}

describe('Agentica client pending-action settlement', () => {
  it.each(['revoked', 'expired'])('keeps a disconnected reservation unresolved until its lease is %s', async reason => {
    const f = clientFixture(); const host = client(); await host.start();
    const before = structuredClone(f.local.world.checkpoint);
    const save = vi.mocked(saveAgenticaAction).getMockImplementation()!;
    const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(saveAgenticaAction).mockImplementationOnce(async (...args) => { await save(...args); entered.resolve(); await gate.promise; });
    const action = f.sendAction(); await entered.promise;
    FixtureSocket.instances[0].close(); gate.resolve();
    await vi.waitFor(() => expect(host.status).toBe('unresolved'));
    expect(settleAgenticaAction).toHaveBeenCalledWith('sdk-test', action);
    expect(await host.reconcile(action)).toBeUndefined();
    expect(f.records.get(actionKey(action))?.status).toBe('pending');
    if (reason === 'revoked') f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    else vi.spyOn(Date, 'now').mockReturnValue(Date.parse(action.deadlineAt));
    const result = await host.reconcile(action);
    expect(result?.disposition).toBe(reason === 'revoked' ? 'conflict' : 'unavailable');
    expect(f.records.get(actionKey(action))).toMatchObject({ status: 'completed', result });
    expect(await host.reconcile(action)).toEqual(result);
    expect(f.local.world.checkpoint).toEqual(before);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('returns a durable no-effect conflict after takeover prechecks, without replacing the action', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const before = structuredClone(f.local.world.checkpoint);
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    const action = f.sendAction(); const result = await f.result();
    expect(result).toMatchObject({ actionId: action.actionId, disposition: 'conflict', beforeRevision: before.revision, afterRevision: before.revision });
    expect(result.observation).toBeDefined(); expect(host.status).toBe('conflict');
    expect(f.records.get(actionKey(action))?.result).toEqual(result);
    expect(f.records.size).toBe(1); expect(f.local.world.checkpoint).toEqual(before);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
    f.sendAction(action);
    await vi.waitFor(() => expect(FixtureSocket.instances[0].sent.filter(message => message.type === 'action.result')).toHaveLength(2));
    expect(await f.result()).toEqual(result); expect(settleAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('prefers an original committed receipt over settlement even after revocation and expiry', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    const action = f.sendAction(); const original = await f.result();
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(action.deadlineAt));
    expect(await host.reconcile(action)).toEqual(original);
    expect(reconcileAgenticaAction).toHaveBeenCalledWith('sdk-test', action);
    expect(settleAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
  });

  it('accepts the original late commit found atomically by the settler after the first read missed it', async () => {
    const f = clientFixture(); const host = client(); await host.start(); const action = reserve(f);
    const settle = vi.mocked(settleAgenticaAction).getMockImplementation()!;
    const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(settleAgenticaAction).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return settle(...args); });
    const pending = host.reconcile(action); await entered.promise;
    // A previously dispatched host transaction commits while reconciliation is outstanding.
    const original = await executeAgenticaAction('sdk-test', action);
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 }; gate.resolve();
    expect(await pending).toEqual(original); expect(executeAgenticaAction).toHaveBeenCalledTimes(1);
    expect(f.records.get(actionKey(action))?.result).toEqual(original);
  });

  it('keeps failed settlement pending and retries only settlement on reconciliation', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    vi.mocked(settleAgenticaAction).mockRejectedValueOnce(new Error('Private recipe: quota failure'));
    const action = f.sendAction(); const unresolved = await f.result();
    expect(unresolved.disposition).toBe('unresolved'); expect(JSON.stringify(unresolved)).not.toContain('recipe');
    expect(f.records.get(actionKey(action))?.status).toBe('pending');
    const result = await host.reconcile(action); expect(result?.disposition).toBe('conflict');
    expect(f.records.get(actionKey(action))?.result).toEqual(result);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('recovers the exact settled receipt when its commit acknowledgement is lost', async () => {
    const f = clientFixture(); const host = client(); await host.start();
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    const settle = vi.mocked(settleAgenticaAction).getMockImplementation()!;
    vi.mocked(settleAgenticaAction).mockImplementationOnce(async (...args) => { await settle(...args); throw new Error('Acknowledgement lost'); });
    const action = f.sendAction(); const result = await f.result();
    expect(result.disposition).toBe('conflict');
    expect(result).toEqual(f.records.get(actionKey(action))?.result);
    expect(await host.reconcile(action)).toEqual(result);
    expect(settleAgenticaAction).toHaveBeenCalledTimes(1); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it.each(['same-client', 'reloaded-client'])('recovers a cancelled SDK reservation through %s and permits a distinct new run', async recoveryClient => {
    const f = clientFixture(); const host = client(); const binding = await host.start();
    const save = vi.mocked(saveAgenticaAction).getMockImplementation()!;
    const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(saveAgenticaAction).mockImplementationOnce(async (...args) => { await save(...args); entered.resolve(); await gate.promise; });
    const action = f.sendAction(); await entered.promise; await host.cancel(); gate.resolve();
    expect((await f.result()).disposition).toBe('unresolved');
    expect(f.records.get(actionKey(action))?.status).toBe('pending');
    const claims = vi.mocked(claimStreamControl).mock.calls.length;
    let custodyResolved = false;
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const original = f.records.get(actionKey(action))?.result;
        expect(original?.disposition).toBe('conflict');
        expect(JSON.parse(options.body as string).result).toEqual(original);
        custodyResolved = true;
      }
      return new Response(JSON.stringify(options?.method === 'POST' ? { actionId: action.actionId, resolved: true }
        : [{ hostId: 'maze-battle', sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, runId: binding.runId, request: action }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const recovering = recoveryClient === 'same-client' ? host : client();
    expect(await recovering.reconcile()).toMatchObject([{ actionId: action.actionId, resolved: true }]);
    expect(claimStreamControl).toHaveBeenCalledTimes(claims); expect(host.status).toBe('cancelled');
    const original = f.records.get(actionKey(action))?.result;
    await recovering.reconcile(); expect(f.records.get(actionKey(action))?.result).toEqual(original);
    const send = FixtureSocket.onSend!;
    FixtureSocket.onSend = (message, socket) => {
      if (message.type === 'start') {
        expect(custodyResolved).toBe(true);
        f.state.started = { ...f.started(message.payload), runId: 'next-service-run' };
        socket.reply(message, 'started', f.state.started, 'next-service-run');
      } else send(message, socket);
    };
    const next = await client().start();
    expect(next.runId).not.toBe(binding.runId); expect(next.sessionEpoch).not.toBe(binding.sessionEpoch);
    expect(f.runs.get(binding.runId)).toEqual(binding);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('does not settle a live reservation solely because game revision changed', async () => {
    const f = clientFixture(); const host = client(); await host.start(); const action = reserve(f);
    await f.local.world.step({ type: 'move', direction: 'north' });
    expect(f.local.world.checkpoint.revision).toBeGreaterThan(action.expectedRevision);
    expect(await host.reconcile(action)).toBeUndefined();
    expect(f.records.get(actionKey(action))?.status).toBe('pending'); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it.each([0, -1])('leaves an inconsistent ownership epoch (%s) unresolved rather than guessing revocation', async offset => {
    const f = clientFixture(); const host = client(); await host.start();
    f.state.control = { sessionId: 'unknown-owner', epoch: f.state.control.epoch + offset };
    const action = f.sendAction(); expect((await f.result()).disposition).toBe('unresolved');
    expect(f.records.get(actionKey(action))?.status).toBe('pending'); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('does not create an outcome for a missing reservation', async () => {
    const f = clientFixture(); const host = client(); await host.start(); const action = f.action();
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    expect(await host.reconcile(action)).toBeUndefined(); expect(f.records.size).toBe(0);
    expect(executeAgenticaAction).not.toHaveBeenCalled();
  });

  it('fails closed on a mutated reserved identity without reaching settlement', async () => {
    const f = clientFixture(); const host = client(); await host.start(); const action = reserve(f);
    const altered = structuredClone(action); altered.arguments.direction = 'south';
    f.state.control = { sessionId: 'human-now', epoch: f.state.control.epoch + 1 };
    await expect(host.reconcile(altered)).rejects.toThrow();
    expect(settleAgenticaAction).not.toHaveBeenCalled(); expect(executeAgenticaAction).not.toHaveBeenCalled();
    expect(f.records.get(actionKey(action))?.status).toBe('pending');
  });

  it('sanitizes settlement failures on SDK reconciliation without overwriting the pending record', async () => {
    const f = clientFixture(); const host = client(); await host.start(); const action = reserve(f);
    vi.mocked(settleAgenticaAction).mockRejectedValue(new Error('Private recipe: 20261008'));
    f.sendAction(action, 'action.reconcile'); const result = await f.result();
    expect(result.disposition).toBe('unresolved'); expect(JSON.stringify(result)).not.toMatch(/recipe|20261008/);
    expect(f.records.get(actionKey(action))?.status).toBe('pending'); expect(executeAgenticaAction).not.toHaveBeenCalled();
  });
});
