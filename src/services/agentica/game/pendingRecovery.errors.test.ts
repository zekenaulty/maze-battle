// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { inPendingRecoveryDatabase, isPendingRecoveryInvalidated, PendingRecoveryInvalidatedError, pendingRecoveryRead } from './pendingRecovery.errors';

vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(inRecoveryDatabase).mockImplementation(async (signal, work) => work(signal!));
});

describe('pending recovery invalidation boundary', () => {
  it('wraps a local read failure with its original cause and a stable typed predicate', async () => {
    const cause = new Error('Local validation failed');
    const error = await pendingRecoveryRead(new AbortController().signal, async () => { throw cause; }).catch(e => e);
    expect(error).toBeInstanceOf(PendingRecoveryInvalidatedError); expect(error.cause).toBe(cause);
    expect(error.code).toBe('pending-recovery.invalidated'); expect(isPendingRecoveryInvalidated(error)).toBe(true);
    expect(isPendingRecoveryInvalidated(new Error(cause.message))).toBe(false);
    expect(isPendingRecoveryInvalidated({ code: error.code })).toBe(false);
  });
  it('does not wrap an existing typed error twice', async () => {
    const original = new PendingRecoveryInvalidatedError(new Error('Changed'));
    await expect(inPendingRecoveryDatabase(new AbortController().signal,
      signal => pendingRecoveryRead(signal, async () => { throw original; }))).rejects.toBe(original);
  });
  it('classifies an open failure before entering the callback', async () => {
    const cause = new Error('Cannot open the existing schema'), work = vi.fn();
    vi.mocked(inRecoveryDatabase).mockRejectedValueOnce(cause);
    await expect(inPendingRecoveryDatabase(new AbortController().signal, work)).rejects.toMatchObject({
      name: 'PendingRecoveryInvalidatedError', cause }); expect(work).not.toHaveBeenCalled();
  });
  it('classifies a final schema guard failure after a successful callback', async () => {
    const cause = new Error('Final schema guard failed');
    vi.mocked(inRecoveryDatabase).mockImplementation(async (signal, work) => { await work(signal!); throw cause; });
    await expect(inPendingRecoveryDatabase(new AbortController().signal, async () => 'done')).rejects.toMatchObject({
      name: 'PendingRecoveryInvalidatedError', cause });
  });
  it('classifies only the exact schema signal reason during a callback', async () => {
    const schema = new AbortController(), cause = new Error('Schema replaced');
    vi.mocked(inRecoveryDatabase).mockImplementation(async (_input, work) => work(schema.signal));
    await expect(inPendingRecoveryDatabase(new AbortController().signal, async signal => {
      schema.abort(cause); signal.throwIfAborted();
    })).rejects.toMatchObject({ name: 'PendingRecoveryInvalidatedError', cause });
  });
  it.each([false, true])('preserves unrelated callback errors even with concurrent schema invalidation (%s)', async changed => {
    const schema = new AbortController(), lost = new Error('Accepted POST reply was lost');
    vi.mocked(inRecoveryDatabase).mockImplementation(async (_input, work) => work(schema.signal));
    await expect(inPendingRecoveryDatabase(new AbortController().signal, async () => {
      if (changed) schema.abort(new Error('Schema replaced'));
      throw lost;
    })).rejects.toBe(lost); expect(isPendingRecoveryInvalidated(lost)).toBe(false);
  });
  it.each(['open', 'read', 'callback', 'final'])('preserves caller cancellation during %s', async phase => {
    const scope = new AbortController(), cancelled = new Error('View closed');
    if (phase === 'open') vi.mocked(inRecoveryDatabase).mockImplementation(async () => { scope.abort(cancelled); throw cancelled; });
    if (phase === 'final') vi.mocked(inRecoveryDatabase).mockImplementation(async (signal, work) => {
      await work(signal!); scope.abort(cancelled); throw cancelled;
    });
    await expect(inPendingRecoveryDatabase(scope.signal, async () => {
      if (phase === 'final') return;
      scope.abort(cancelled);
      if (phase === 'read') return pendingRecoveryRead(scope.signal, async () => { throw cancelled; });
      throw cancelled;
    })).rejects.toBe(cancelled);
  });
});
