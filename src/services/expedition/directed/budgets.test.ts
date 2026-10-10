// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateDestinationBudget } from '../../../domain/directed/destinationBudgetValidation';
import { applyLocal, at, fixture } from '../../../domain/expedition/streaming/planner.testSupport';
import { prepareDirectedStreamStep, settleDirectedStreamMove, startDirectedStreamTravel } from './adapter';

describe('streamed travel with host-configured budgets', () => {
  it('runs 150 learned local moves under one identity without a hidden 64-step/128-attempt ceiling', async () => {
    const f = fixture(151, [150]);
    const frame = { checkpoint: f.checkpoint, control: { sessionId: 'controller', epoch: 1 } };
    const target = { kind: 'chest' as const, chestId: 'loot-150', address: at(150), arrival: 'occupy' as const };
    const read = async () => structuredClone(f.page);
    let { state } = await startDirectedStreamTravel(frame, { id: 'long-trip', target,
      limits: { steps: null, replans: null, durationMs: null } }, read, () => 0);
    for (let index = 0; index < 150; index++) {
      const next = await prepareDirectedStreamStep(state, state.frame,
        { operationId: 'long-trip', sequence: index, actionId: `local-${index}` }, read, () => 500000 + index);
      expect(next.kind).toBe('move');
      if (next.kind !== 'move') throw new Error('Expected remembered route');
      const request = next.state.pending!.request;
      applyLocal(f, request.command);
      state = settleDirectedStreamMove(next.state, { actionId: request.actionId, disposition: 'applied',
        beforeRevision: request.expectedRevision, afterRevision: f.checkpoint.revision,
        topologyRevision: f.checkpoint.topologyRevision, reason: 'Move applied.' }, false, f.checkpoint);
      validateDestinationBudget(state.operation);
    }
    expect(state.operation).toMatchObject({ id: 'long-trip', status: 'arrived', steps: 150, nextStep: 150,
      limits: { steps: null, replans: null, durationMs: null }, deadline: null });
    expect(f.checkpoint.collectedChests).toBe(0);
    expect(f.page.chests['loot-150'].opened).toBe(false);
  });

  it('does not confuse unlimited travel policy with unlimited actor-map residency', async () => {
    const f = fixture(513);
    const result = await startDirectedStreamTravel({ checkpoint: f.checkpoint, control: { sessionId: 'controller', epoch: 1 } },
      { id: 'too-large', target: { kind: 'cell', address: at(512), arrival: 'occupy' },
        limits: { steps: null, replans: null, durationMs: null } }, async () => f.page, () => 0);
    expect(result.state.operation).toMatchObject({ status: 'interrupted', reason: 'Known-map budget exceeded.' });
  });
});
