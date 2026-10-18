// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provePregrantNoEffect } from '../../../persistence/canonical/agentica/pregrant-proof';
import { decisionState } from './decisionState';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { recoverPregrantAction } from './pendingRecovery';
import { binding, decisionView, noEffect, parentAction, pendingAction, remoteEntry, reply, response } from './pendingRecovery.test-support';

vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: vi.fn() }));
vi.mock('./decisionState', () => ({ decisionState: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(decisionState).mockResolvedValue(structuredClone(decisionView));
  vi.mocked(provePregrantNoEffect).mockImplementation(async () => structuredClone(noEffect));
  vi.mocked(inRecoveryDatabase).mockImplementation(async (signal, read) => read(signal!));
});
const port = () => ({ hostSignal: new AbortController().signal });
const network = () => vi.fn<typeof fetch>()
  .mockResolvedValueOnce(response(remoteEntry())).mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(remoteEntry(true)));

describe('explicit pregrant HTTP recovery composition', () => {
  it('binds one remote original, posts only the proven result, and verifies pinned retention without game writes', async () => {
    const http = network(), host = port();
    expect(await recoverPregrantAction(host, parentAction, binding, pendingAction, { fetchImpl: http }))
      .toEqual({ status: 'action-reconciled', result: noEffect, duplicate: false, rootClear: 'unknown', sessionClear: 'unknown' });
    expect(http).toHaveBeenCalledTimes(3); expect(provePregrantNoEffect).toHaveBeenCalledTimes(3);
    const [url, init] = http.mock.calls[1];
    expect(url).toBe('http://127.0.0.1:5259/api/recovery');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' });
    expect(JSON.parse(init!.body as string)).toEqual({ hostId: 'maze-battle', sessionId: 'session', result: noEffect });
    const lookup = new URL(String(http.mock.calls[0][0]));
    expect(lookup.pathname).toBe('/api/recovery/action');
    expect([...lookup.searchParams]).toEqual([['hostId', 'maze-battle'], ['sessionId', 'session'], ['actionId', 'pending']]);
  });
  it('revalidates a pinned result and repeats the identical POST for exact lost-reply reconciliation', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteEntry(true)))
      .mockResolvedValueOnce(response(reply(true))).mockResolvedValueOnce(response(remoteEntry(true)));
    expect((await recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).duplicate).toBe(true);
    expect(JSON.parse(http.mock.calls[1][1]!.body as string).result).toEqual(noEffect);
  });
  it('does not contact a service when cancellation/no-effect evidence fails', async () => {
    vi.mocked(provePregrantNoEffect).mockRejectedValueOnce(new Error('not stopped')); const http = network();
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('not stopped');
    expect(http).not.toHaveBeenCalled();
  });
  it('checks the existing schema before the first canonical reader or network call', async () => {
    vi.mocked(inRecoveryDatabase).mockRejectedValueOnce(new Error('no current schema')); const http = network();
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('no current schema');
    expect(decisionState).not.toHaveBeenCalled(); expect(provePregrantNoEffect).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled();
  });
  it('accepts a bound interim unresolved result without using its observation', async () => {
    const entry = remoteEntry(true); entry.recoveryRetention = 'reserved';
    entry.result = { ...entry.result!, disposition: 'unresolved', evidenceId: 'interim', summary: 'Awaiting reconciliation' };
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(response(entry))
      .mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(remoteEntry(true)));
    const recovered = await recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http });
    expect(recovered.result).toEqual(noEffect); expect(recovered.result.observation).toBeUndefined();
  });
  it('rejects an interim result with another session before POST', async () => {
    const entry = remoteEntry(true); entry.recoveryRetention = 'reserved';
    entry.result = { ...entry.result!, disposition: 'unresolved', sessionId: 'foreign' };
    const http = vi.fn<typeof fetch>().mockResolvedValue(response(entry));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('invalid interim');
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('captures caller input before yielding and does not let a callback replace the target', async () => {
    const action = structuredClone(pendingAction), parent = structuredClone(parentAction), originalBinding = structuredClone(binding), http = network();
    const result = recoverPregrantAction(port(), parent, originalBinding, action, { fetchImpl: http });
    action.arguments.scope = 'map'; parent.actionId = 'different'; originalBinding.grant.id = 'different';
    await result;
    expect(vi.mocked(provePregrantNoEffect).mock.calls[0][1].action).toEqual(parentAction);
    expect(vi.mocked(provePregrantNoEffect).mock.calls[0][2]).toEqual(binding);
    expect(vi.mocked(provePregrantNoEffect).mock.calls[0][3]).toEqual(pendingAction);
  });
  it.each(['request', 'capability', 'result'] as const)('rejects a different remote %s before POST', async field => {
    const entry = remoteEntry(true);
    if (field === 'request') entry.request.arguments.scope = 'map';
    if (field === 'capability') entry.capability.name += 'changed';
    if (field === 'result') entry.result!.evidenceId += 'changed';
    const http = vi.fn<typeof fetch>().mockResolvedValue(response(entry));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow(/changed|differs/);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('preserves the live-run refusal without retry, socket connection or fabricated ACK', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteEntry()))
      .mockResolvedValueOnce(response({ code: 'recovery.live_run', message: 'Still running' }, 409));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toMatchObject({ code: 'recovery.live_run' });
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('does not treat a missing remote action as clearance or permission to post', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(response({ code: 'custody.not_found', message: 'Missing' }, 409));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toMatchObject({ code: 'custody.not_found' });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('requires the committed pin, not just a successful POST', async () => {
    const entry = remoteEntry(true); entry.recoveryRetention = 'reserved';
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteEntry()))
      .mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(entry));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('retain the exact');
  });
  it('stops before POST when a fresh proof rejects the captured fence', async () => {
    vi.mocked(provePregrantNoEffect).mockResolvedValueOnce(noEffect).mockRejectedValueOnce(new Error('owner changed'));
    const http = network();
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('owner changed');
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('refuses a result if the game lifetime changes while the read is in flight', async () => {
    const host = port(), http = vi.fn<typeof fetch>().mockImplementation(async () => {
      host.hostSignal = new AbortController().signal; return response(remoteEntry());
    });
    await expect(recoverPregrantAction(host, parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('lifetime changed');
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('returns the lost-reply failure without an implicit second effect', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteEntry())).mockRejectedValueOnce(new Error('reply lost'));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction, { fetchImpl: http })).rejects.toThrow('reply lost');
    expect(http).toHaveBeenCalledTimes(2);
  });
});
