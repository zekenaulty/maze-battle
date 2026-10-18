// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { provePregrantNoEffect } from '../../../persistence/canonical/agentica/pregrant-proof';
import { canonicalFence } from '../../../persistence/canonical/transaction';
import { decisionState } from './decisionState';
import { recoverPregrantAction } from './pendingRecovery';
import { binding, decisionView, noEffect, parentAction, pendingAction, remoteEntry, reply, response } from './pendingRecovery.test-support';

vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/pregrant-proof', () => ({ provePregrantNoEffect: vi.fn() }));
vi.mock('./decisionState', () => ({ decisionState: vi.fn() }));
const expectedFence = canonicalFence(decisionView.head);
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(decisionState).mockResolvedValue(structuredClone(decisionView));
  vi.mocked(provePregrantNoEffect).mockImplementation(async () => structuredClone(noEffect));
  vi.mocked(inRecoveryDatabase).mockImplementation(async (signal, work) => { signal!.throwIfAborted(); return work(signal!); });
});
const port = () => ({ hostSignal: new AbortController().signal });
const network = () => vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteEntry()))
  .mockResolvedValueOnce(response(reply())).mockResolvedValueOnce(response(remoteEntry(true)));

describe('pregrant composition explicit scope and fence', () => {
  it('refuses an already dismissed scope before database reads, proof or network', async () => {
    const scope = new AbortController(), http = network(); scope.abort(new Error('dismissed'));
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction,
      { signal: scope.signal, expectedFence, fetchImpl: http })).rejects.toThrow('dismissed');
    expect(inRecoveryDatabase).not.toHaveBeenCalled(); expect(decisionState).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled();
  });
  it('refuses a stale inspected fence instead of silently deriving a fresh one', async () => {
    const http = network();
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction,
      { expectedFence: { ...expectedFence, revision: expectedFence.revision - 1 }, fetchImpl: http })).rejects.toThrow('inspected fence changed');
    expect(provePregrantNoEffect).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled();
  });
  it('captures the inspected fence before yielding and uses it for every proof', async () => {
    const captured = { ...expectedFence }, http = network();
    const result = recoverPregrantAction(port(), parentAction, binding, pendingAction, { expectedFence: captured, fetchImpl: http });
    captured.owner = 'other'; captured.revision++;
    await result; expect(vi.mocked(provePregrantNoEffect).mock.calls.map(call => call[0])).toEqual([expectedFence, expectedFence, expectedFence]);
  });
  it('propagates view dismissal through the schema hold and HTTP abort without ending the host', async () => {
    const scope = new AbortController(), host = port();
    const http = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      scope.abort(new Error('dismissed')); expect(init!.signal!.aborted).toBe(true); return response(remoteEntry());
    });
    await expect(recoverPregrantAction(host, parentAction, binding, pendingAction,
      { signal: scope.signal, expectedFence, fetchImpl: http })).rejects.toThrow('dismissed');
    expect(http).toHaveBeenCalledTimes(1); expect(host.hostSignal.aborted).toBe(false);
    expect(vi.mocked(inRecoveryDatabase).mock.calls[0][0]!.aborted).toBe(true);
  });
  it('checks scope again after a local reader resolves late', async () => {
    const scope = new AbortController(), http = network();
    vi.mocked(decisionState).mockImplementation(async () => { scope.abort(new Error('dismissed')); return structuredClone(decisionView); });
    await expect(recoverPregrantAction(port(), parentAction, binding, pendingAction,
      { signal: scope.signal, expectedFence, fetchImpl: http })).rejects.toThrow('dismissed');
    expect(provePregrantNoEffect).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled();
  });
});
