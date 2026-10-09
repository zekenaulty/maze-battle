import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpedition } from '../../hooks/useExpedition';
import type { ExpeditionActionRequest } from '../../domain/expedition/protocol';
import { durableFixture } from '../../persistence/expeditionAction.testSupport';
import {
  beginExpeditionAction, claimExpeditionSession, loadExpeditionAction,
  loadExpeditionSession, settleExpeditionAction,
  type DurableExpeditionReceipt, type DurableExpeditionSession,
} from '../../persistence/expeditionActionRepository';
import { loadExpedition } from '../../persistence/expeditionRepository';
import { ExpeditionRuntime } from './runtime';
import { restoreExpedition } from './restore';

vi.mock('../../persistence/expeditionActionRepository', () => ({
  beginExpeditionAction: vi.fn(), claimExpeditionSession: vi.fn(),
  loadExpeditionAction: vi.fn(), loadExpeditionSession: vi.fn(), settleExpeditionAction: vi.fn(),
}));
vi.mock('../../persistence/expeditionRepository', () => ({ loadExpedition: vi.fn(), saveExpedition: vi.fn() }));

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

let record: ReturnType<typeof durableFixture>;
let session: DurableExpeditionSession;

function pending(request: ExpeditionActionRequest): DurableExpeditionReceipt {
  return { version: 1, request: structuredClone(request), signature: 'review-only', result: {
    actionId: request.actionId, disposition: 'unresolved', beforeRevision: request.expectedRevision,
    afterRevision: request.expectedRevision, reason: 'Reserved.',
  } };
}

beforeEach(() => {
  vi.resetAllMocks();
  record = durableFixture();
  session = { version: 1, worldId: record.plan.recipe.worldId, floorId: record.plan.recipe.floorId,
    scopeId: record.plan.scopeId, sessionId: 'owner-a', epoch: 0, maxActions: 4096,
    receiptCount: 0, pendingActionId: null };
  vi.mocked(loadExpedition).mockImplementation(async () => structuredClone(record));
  vi.mocked(loadExpeditionSession).mockImplementation(async () => structuredClone(session));
  vi.mocked(claimExpeditionSession).mockImplementation(async (_slot, sessionId, expectedEpoch) => {
    expect(expectedEpoch).toBe(session.epoch);
    session = { ...session, sessionId, epoch: session.epoch + 1 };
    return structuredClone(session);
  });
  vi.mocked(beginExpeditionAction).mockImplementation(async (_slot, request) => {
    expect(request).toMatchObject({ sessionId: session.sessionId, epoch: session.epoch,
      expectedRevision: record.checkpoint.revision });
    return { status: 'reserved', receipt: pending(request), ...structuredClone(record) };
  });
  vi.mocked(settleExpeditionAction).mockImplementation(async (_slot, request, outcome) => {
    record = { ...record, checkpoint: structuredClone(outcome.checkpoint) };
    return { ...pending(request), result: structuredClone(outcome.result) };
  });
});

afterEach(() => cleanup());

// These invariants fail at integration commit cdea65b. Remove .fails as each
// production fix lands; repository I/O is mocked, runtime/restore/hook are real.
describe('integration review: deterministic control interleavings', () => {
  it.fails('does not publish a tentative move after reload cancelled its pending receipt', async () => {
    const entered = gate();
    const release = gate();
    let receipt: DurableExpeditionReceipt;
    const publish = vi.fn();
    const runtime = new ExpeditionRuntime({ ...structuredClone(record), owner: session }, publish);
    vi.mocked(settleExpeditionAction).mockImplementation(async (_slot, request, outcome, owner) => {
      if (owner) {
        // Actual restore reconciles the old reservation with the new owner's token.
        receipt = { ...receipt, result: structuredClone(outcome.result) };
        session = { ...session, pendingActionId: null };
        return structuredClone(receipt);
      }
      receipt = pending(request);
      session = { ...session, pendingActionId: request.actionId };
      vi.mocked(loadExpeditionAction).mockImplementation(async () => structuredClone(receipt));
      entered.resolve();
      await release.promise;
      // Repository settled-replay behavior returns the original receipt before
      // checking ownership, ignoring this old writer's newly computed outcome.
      return structuredClone(receipt);
    });

    const oldAction = runtime.dispatch({ type: 'move', direction: 'east' });
    await entered.promise;
    const restored = await restoreExpedition(() => false);
    release.resolve();
    const result = await oldAction;

    expect(restored?.owner.epoch).toBe(1);
    expect(result.disposition).toBe('refused');
    expect(record.checkpoint.revision).toBe(0);
    expect(runtime.checkpoint).toEqual(record.checkpoint);
    expect(publish.mock.calls.every(([view]) => view.checkpoint.revision === 0)).toBe(true);
  });

  it.fails('does not stamp a pre-takeover route decision with a later checkpoint revision', async () => {
    const entered = gate();
    const release = gate();
    const runtime = new ExpeditionRuntime({ ...structuredClone(record), owner: session }, vi.fn());
    const settle = vi.mocked(settleExpeditionAction).getMockImplementation()!;
    vi.mocked(settleExpeditionAction).mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return settle(...args);
    });
    expect(runtime.decide().command).toEqual({ type: 'move', direction: 'east' });
    const moving = runtime.dispatch({ type: 'move', direction: 'east' });
    await entered.promise;

    const takeover = runtime.takeOver();
    // A resumed autoplay timer may plan while takeover is waiting for the move.
    const oldDecision = runtime.decide();
    expect(oldDecision.command).toEqual({ type: 'move', direction: 'east' });
    const queued = runtime.dispatch(oldDecision.command!);
    release.resolve();
    expect((await moving).disposition).toBe('applied');
    await takeover;
    await queued;

    // At (0, 1), the new decision should collect the discovered chest, not execute
    // another east chosen for (0, 0). Rejecting the stale intent also satisfies this.
    expect(record.checkpoint.position).toMatchObject({ row: 0, column: 1 });
  });

  it.fails('lets the latest manual key survive an earlier Control changed result', async () => {
    const { result } = renderHook(() => useExpedition());
    await waitFor(() => expect(result.current.runtime).toBeDefined());
    const entered = gate();
    const release = gate();
    const claim = vi.mocked(claimExpeditionSession).getMockImplementation()!;
    vi.mocked(claimExpeditionSession).mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return claim(...args);
    });

    await act(async () => {
      const first = result.current.dispatch({ type: 'move', direction: 'east' }, true);
      await entered.promise;
      const latest = result.current.dispatch({ type: 'move', direction: 'south' }, true);
      release.resolve();
      await Promise.all([first, latest]);
    });

    expect(result.current.error).toBeUndefined();
    expect(record.checkpoint.position).toMatchObject({ row: 1, column: 0 });
  });
});
