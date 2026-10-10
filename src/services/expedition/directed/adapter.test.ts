// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDestinationOperation } from '../../../domain/directed/destinationExecution';
import { at, fixture } from '../../../domain/expedition/streaming/planner.testSupport';
import type { StreamActionResult } from '../../../domain/expedition/streaming/types';
import type { DirectedStreamTravel, StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { cancelDirectedStreamTravel, pauseDirectedStreamTravel, prepareDirectedStreamStep,
  settleDirectedStreamMove, startDirectedStreamTravel } from './adapter';

async function setup(length = 5) {
  const f = fixture(length, [length - 1]);
  const frame = { checkpoint: f.checkpoint, control: { sessionId: 'actor', epoch: 2 } };
  const target: StreamDestination = { kind: 'cell', address: at(length - 1), arrival: 'occupy' };
  const read = vi.fn(async () => structuredClone(f.page));
  const { state } = await startDirectedStreamTravel(frame, { id: 'travel', target }, read, () => 0);
  read.mockClear();
  return { f, frame, target, read, state };
}
const step = { operationId: 'travel', sequence: 0, actionId: 'attempt-0' };

function receipt(state: DirectedStreamTravel, disposition: 'applied' | 'refused' = 'applied'): StreamActionResult {
  const move = state.pending!;
  const checkpoint = state.frame.checkpoint;
  const afterRevision = checkpoint.revision + (disposition === 'applied' ? 1 : 0);
  return { actionId: move.request.actionId, disposition, beforeRevision: checkpoint.revision, afterRevision,
    topologyRevision: checkpoint.topologyRevision, reason: 'Host result.',
    observation: { version: 2, worldId: checkpoint.worldId, floorId: checkpoint.floorId, scopeId: checkpoint.scopeId,
      revision: afterRevision, topologyRevision: checkpoint.topologyRevision, phase: checkpoint.phase,
      position: disposition === 'applied' ? move.to : move.from, visibleCells: [], visibleOpenings: [], visibleChests: [], visibleFrontiers: [] } };
}

describe('streamed shared lifecycle and custody', () => {
  it('uses the identical generic operation for start, arrival and the 64-step ceiling', async () => {
    const f = await setup();
    expect(f.state.operation).toEqual(createDestinationOperation({ id: 'travel', target: f.target, now: 0, epoch: 2,
      plan: { status: 'ready', route: [at(1), at(2), at(3), at(4)], distance: 4, visits: 5 } }));
    expect((await setup(65)).state.operation.status).toBe('running');
    expect((await setup(66)).state.operation).toMatchObject({ status: 'interrupted', route: [], steps: 0,
      reason: 'Destination exceeds travel step budget.' });
    const here = await startDirectedStreamTravel(f.frame, { id: 'here', target: { kind: 'cell', address: at(0), arrival: 'occupy' } }, f.read, () => 0);
    expect(here.state.operation).toMatchObject({ status: 'arrived', steps: 0, reason: 'Arrived. No interaction performed.' });
  });

  it('fences owner, epoch, scope, both revisions, position, operation and sequence before page reads', async () => {
    const f = await setup();
    const frames = [
      { ...f.frame, control: { sessionId: 'other', epoch: 2 } },
      { ...f.frame, control: { sessionId: 'actor', epoch: 3 } },
      ...[{ revision: 1 }, { topologyRevision: 1 }, { worldId: 'other' }, { floorId: 'other' }, { scopeId: 'other' },
        { position: at(1) }, { phase: 'complete' as const }].map(change => ({ ...f.frame, checkpoint: { ...f.frame.checkpoint, ...change } })),
    ];
    for (const frame of frames) expect((await prepareDirectedStreamStep(f.state, frame, step, f.read, () => 10)).kind).toBe('refused');
    for (const invalid of [{ ...step, operationId: 'other' }, { ...step, sequence: 1 }]) {
      expect((await prepareDirectedStreamStep(f.state, f.frame, invalid, f.read, () => 10)).kind).toBe('refused');
    }
    expect(f.read).not.toHaveBeenCalled();
    expect(f.state.operation.nextStep).toBe(0);
  });

  it('enforces time and step limits before reading, and rechecks time after asynchronous page loading', async () => {
    const f = await setup();
    for (const [state, time] of [[f.state, 120_000], [{ ...f.state, operation: { ...f.state.operation, steps: 64 } }, 1]] as const) {
      const stopped = await prepareDirectedStreamStep(state, f.frame, step, f.read, () => time);
      expect(stopped.kind).toBe('stopped');
      if (stopped.kind !== 'stopped') throw new Error('Expected limit');
      expect(stopped.state.operation.status).toBe('interrupted');
      expect(stopped.state.pending).toBeUndefined();
    }
    expect(f.read).not.toHaveBeenCalled();
    let time = 100;
    const delayed = await prepareDirectedStreamStep(f.state, f.frame, step, async () => {
      time = 120_000; return f.f.page;
    }, () => time);
    expect(delayed.kind).toBe('stopped');
    if (delayed.kind !== 'stopped') throw new Error('Expected deadline');
    expect(delayed.state.pending).toBeUndefined();
  });

  it('charges changed routes to the same four-replan allowance and respects remaining steps', async () => {
    const f = await setup();
    const stale = structuredClone(f.state);
    stale.operation.route = [];
    const replanned = await prepareDirectedStreamStep(stale, f.frame, step, f.read, () => 10);
    expect(replanned.kind).toBe('move');
    if (replanned.kind !== 'move') throw new Error('Expected replan');
    expect(replanned.state.operation.replans).toBe(1);
    stale.operation.replans = 4;
    const exhausted = await prepareDirectedStreamStep(stale, f.frame, step, f.read, () => 10);
    expect(exhausted.kind === 'stopped' && exhausted.state.operation.reason).toBe('Local replan budget exhausted.');
    stale.operation.replans = 0; stale.operation.steps = 62;
    const remaining = await prepareDirectedStreamStep(stale, f.frame, step, f.read, () => 10);
    expect(remaining.kind === 'stopped' && remaining.state.operation.reason).toBe('Destination exceeds remaining travel step budget.');
  });

  it('refuses overlapping or duplicate steps, and requires exact settlement identity', async () => {
    const f = await setup();
    const proposal = await prepareDirectedStreamStep(f.state, f.frame, step, f.read, () => 10);
    if (proposal.kind !== 'move') throw new Error('Expected move');
    f.read.mockClear();
    expect((await prepareDirectedStreamStep(proposal.state, f.frame, { ...step, sequence: 1 }, f.read, () => 11)).kind).toBe('refused');
    expect(f.read).not.toHaveBeenCalled();
    expect(() => settleDirectedStreamMove(proposal.state, { ...receipt(proposal.state), actionId: 'wrong-attempt' })).toThrow(/matching/);
    const settled = settleDirectedStreamMove(proposal.state, receipt(proposal.state));
    expect(settled.operation).toMatchObject({ steps: 1, nextStep: 1 });
    expect((await prepareDirectedStreamStep(settled, settled.frame, step, f.read, () => 12)).kind).toBe('refused');
    expect(() => settleDirectedStreamMove(settled, receipt(proposal.state))).toThrow(/matching/);
  });

  it('keeps cancellation and reload paused even when the original move settles later', async () => {
    const f = await setup();
    const proposal = await prepareDirectedStreamStep(f.state, f.frame, step, f.read, () => 10);
    if (proposal.kind !== 'move') throw new Error('Expected move');
    const cancelled = cancelDirectedStreamTravel(proposal.state);
    expect(cancelled.pending).toEqual(proposal.state.pending);
    const settledCancel = settleDirectedStreamMove(cancelled, receipt(proposal.state));
    expect(settledCancel.operation).toMatchObject({ status: 'cancelled', route: [], steps: 1 });
    expect(settledCancel.pending).toBeUndefined();
    const paused = pauseDirectedStreamTravel(proposal.state);
    const settledPause = settleDirectedStreamMove(paused, receipt(proposal.state));
    expect(settledPause.paused).toBe(true);
    expect(settledPause.operation.route).toEqual([]);
    f.read.mockClear();
    for (const state of [settledCancel, settledPause, pauseDirectedStreamTravel(f.state), cancelDirectedStreamTravel(f.state)]) {
      expect((await prepareDirectedStreamStep(state, state.frame, { ...step, sequence: state.operation.nextStep }, f.read, () => 20)).kind).toBe('refused');
    }
    expect(f.read).not.toHaveBeenCalled();
  });

  it('preserves unknown or mismatched attempts without issuing a replacement', async () => {
    const f = await setup();
    const proposal = await prepareDirectedStreamStep(f.state, f.frame, step, f.read, () => 10);
    if (proposal.kind !== 'move') throw new Error('Expected move');
    for (const result of [{ ...receipt(proposal.state), disposition: 'unavailable' as const },
      { ...receipt(proposal.state), afterRevision: 99 },
      { ...receipt(proposal.state), observation: { ...receipt(proposal.state).observation!, position: at(4) } }]) {
      const unknown = settleDirectedStreamMove(proposal.state, result);
      expect(unknown.paused).toBe(true);
      expect(unknown.pending).toEqual(proposal.state.pending);
      expect(unknown.operation.steps).toBe(0);
      expect((await prepareDirectedStreamStep(unknown, f.frame, { ...step, sequence: 1 }, f.read, () => 20)).kind).toBe('refused');
      const reconciled = settleDirectedStreamMove(unknown, receipt(proposal.state));
      expect(reconciled.pending).toBeUndefined();
      expect(reconciled.paused).toBe(true);
    }
  });

  it('learns only the immediate collided edge and does not infer collisions from arbitrary refusals', async () => {
    const f = await setup();
    const proposal = await prepareDirectedStreamStep(f.state, f.frame, step, f.read, () => 10);
    if (proposal.kind !== 'move') throw new Error('Expected move');
    const result = receipt(proposal.state, 'refused');
    const blocked = settleDirectedStreamMove(proposal.state, result, true);
    expect(blocked.blocked).toEqual([{ from: at(0), to: at(1), revision: 0 }]);
    expect(blocked.operation).toMatchObject({ status: 'running', route: [], steps: 0 });
    const stopped = await prepareDirectedStreamStep(blocked, blocked.frame, { ...step, sequence: 1 }, f.read, () => 11);
    expect(stopped.kind === 'stopped' && stopped.state.operation.reason).toBe('No known route.');
    const refused = settleDirectedStreamMove(proposal.state, result);
    expect(refused.blocked).toEqual([]);
    expect(refused.operation.status).toBe('interrupted');
  });

  it('stops before producing a move when cancellation occurs during a page read', async () => {
    const f = await setup();
    let current = true;
    const result = await prepareDirectedStreamStep(f.state, f.frame, step, async () => {
      current = false; return f.f.page;
    }, () => 10, () => current);
    expect(result.kind).toBe('stopped');
    expect(result.kind !== 'refused' && result.state.pending).toBeUndefined();
  });
});
