import { describe, expect, it } from 'vitest';
import { createTopology } from '../domain/expedition/topology/generation';
import { materializeTopologySpace } from '../domain/expedition/topology/projection';
import { initializeStream } from '../domain/expedition/streaming/transition';
import type { StreamActionReceipt, StreamActionRequest } from '../domain/expedition/streaming/types';
import { validateStreamKnowledge } from './streamKnowledge';
import { requireCurrentKnowledge } from './streamRecords';
import { streamActionSignature, validateStreamCheckpoint, validateStreamControl, validateStreamReceipt } from './streamValidation';

function fixture() {
  const delta = createTopology({ version: 'spaces-v2', worldId: 'world', floorId: 'floor', level: 1, seed: 0 });
  const room = { space: delta.spaces[0], connections: [], sockets: delta.sockets };
  return { header: delta.header, room, ...initializeStream(delta.header, room, materializeTopologySpace) };
}
const request = (): StreamActionRequest => ({ version: 2, actionId: 'action', sessionId: 'owner', epoch: 0,
  expectedRevision: 0, expectedTopologyRevision: 0, command: { type: 'prepare', frontierId: 'socket-0' } });

describe('bounded stream persistence validation', () => {
  it('requires the current saved page to match the checkpoint, never regenerating stale evidence', () => {
    const { room, checkpoint, pages } = fixture();
    expect(requireCurrentKnowledge(checkpoint, { ...room, knowledge: pages[0] })).toEqual(pages[0]);
    expect(() => requireCurrentKnowledge({ ...checkpoint, revision: 1 }, { ...room, knowledge: pages[0] })).toThrow(/revision disagree/);
    expect(() => requireCurrentKnowledge(checkpoint, room)).toThrow(/missing current/);
  });
  it('signs every identity, ownership, CAS and command field without property-order dependence', () => {
    const original = request(), signature = streamActionSignature(original);
    expect(streamActionSignature({ command: original.command, expectedTopologyRevision: 0, expectedRevision: 0,
      epoch: 0, sessionId: 'owner', actionId: 'action', version: 2 })).toBe(signature);
    for (const changed of [{ actionId: 'other' }, { sessionId: 'other' }, { epoch: 1 }, { expectedRevision: 1 }, { expectedTopologyRevision: 1 },
      { command: { type: 'move' as const, direction: 'north' as const } }]) expect(streamActionSignature({ ...original, ...changed })).not.toBe(signature);
  });
  it.each([
    { version: 1 }, { epoch: -1 }, { expectedRevision: NaN }, { expectedTopologyRevision: Infinity },
    { sessionId: '' }, { actionId: 'x'.repeat(129) }, { extra: true },
    { command: { type: 'prepare', frontierId: '' } }, { command: { type: 'collect', extra: true } }, { command: { type: 'move', direction: 'up' } },
  ])('rejects malformed request %j', changes => {
    expect(() => streamActionSignature({ ...request(), ...changes } as StreamActionRequest)).toThrow();
  });
  it('rejects control overflow, inconsistent checkpoint identity/counters and premature completion', () => {
    expect(() => validateStreamControl({ sessionId: 'owner', epoch: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    const { checkpoint, header } = fixture();
    expect(() => validateStreamCheckpoint(checkpoint, header)).not.toThrow();
    for (const change of [{ scopeId: 'foreign' }, { topologyRevision: 1 }, { moves: 1 }, { visitedSpaces: 2 }, { collectedChests: 1 },
      { home: { spaceId: 'entry', row: 0, column: 0 } }, { phase: 'complete' as const }]) {
      expect(() => validateStreamCheckpoint({ ...checkpoint, ...change }, header)).toThrow();
    }
  });
  it('rejects future observations, inconsistent keys, unbounded pages and unknown completed exits', () => {
    const { pages: [page], room } = fixture();
    expect(() => validateStreamKnowledge(page, 'entry', 0, room)).not.toThrow();
    const cellKey = Object.keys(page.cells)[0];
    for (const mutate of [
      (value: typeof page) => { value.cells[cellKey].observedAt = 1; },
      (value: typeof page) => { value.cells.wrong = value.cells[cellKey]; delete value.cells[cellKey]; },
      (value: typeof page) => { value.frontiers[Object.keys(value.frontiers)[0]].id = 'different'; },
      (value: typeof page) => { value.completedExits.push('unknown'); },
      (value: typeof page) => { value.cells = Object.fromEntries(Array.from({ length: 226 }, (_, index) => [index, value.cells[cellKey]])); },
    ]) {
      const broken = structuredClone(page); mutate(broken);
      expect(() => validateStreamKnowledge(broken, 'entry', 0, room)).toThrow();
    }
  });
  it('allows compact prepare refresh/expansion receipts but no map payload or impossible revision', () => {
    const input = request(), checkpoint = { ...fixture().checkpoint, revision: 2, topologyRevision: 1 };
    const receipt: StreamActionReceipt = { request: input, signature: streamActionSignature(input), result: {
      actionId: input.actionId, disposition: 'applied', beforeRevision: 0, afterRevision: 1, topologyRevision: 0, reason: 'Refreshed.' } };
    expect(() => validateStreamReceipt(receipt, input.actionId, checkpoint)).not.toThrow();
    receipt.result.topologyRevision = 1;
    expect(() => validateStreamReceipt(receipt, input.actionId, checkpoint)).not.toThrow();
    receipt.result.topologyRevision = 2;
    expect(() => validateStreamReceipt(receipt, input.actionId, checkpoint)).toThrow();
    receipt.result.topologyRevision = 1; receipt.result.observation = fixture().observation;
    expect(() => validateStreamReceipt(receipt, input.actionId, checkpoint)).toThrow();
  });
});
