import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { assertSingleCompletionAttempt, assertSingleProgressDelivery } from './canonical-start-service.corpus-delivery.checks';

class MemorySocket extends EventTarget {
  static forwarded: unknown[] = [];
  send(data: string | BufferSource | Blob) { MemorySocket.forwarded.push(data); }
  close() {}
}
beforeEach(() => { vi.resetModules(); MemorySocket.forwarded = []; vi.stubGlobal('WebSocket', MemorySocket); });
afterEach(() => vi.unstubAllGlobals());

for (const socket of ['same', 'new'] as const) test(`completion mutation: rejected duplicate on ${socket} socket remains counted`, async () => {
  const { loseCompletionConfirmation, deliveryFault } = await import('./canonical-start-service.corpus-delivery.fault');
  loseCompletionConfirmation();
  const original = new WebSocket('ws://offline.invalid');
  const frame = JSON.stringify({ type: 'action.result', runId: 'original-run', payload: {
    actionId: 'original-action', completion: { evidenceId: 'original-evidence' },
  } });
  original.send(frame);
  assertSingleCompletionAttempt(deliveryFault()!);
  const retry = socket === 'same' ? original : new WebSocket('ws://offline.invalid');
  expect(() => retry.send(frame)).toThrow('Duplicate completion');
  const recorded = deliveryFault()!;
  expect(recorded.completionAttempts).toEqual([JSON.parse(frame), JSON.parse(frame)]);
  expect(recorded.sent).toHaveLength(1); expect(MemorySocket.forwarded).toHaveLength(1);
  expect(() => assertSingleCompletionAttempt(recorded)).toThrow(/Every attempt/);
});

const event: HostOperationEvent = { hostId: 'host', sessionId: 'session', sessionEpoch: '3',
  actionId: 'action', operationId: 'operation', eventId: 'event', sequence: 2, kind: 'progress',
  observation: { observationId: 'observation', revision: 1, observedAt: '2026-10-23T00:00:00Z', data: { outcome: 'applied' } },
  summary: 'Original committed progress.', usage: {} };
const request = (body: unknown) => ({ method: 'POST', url: 'http://offline.invalid/api/operations/events', body });
const reordered = () => Object.fromEntries(Object.entries(event).reverse());

test('one property-reordered original passes structural payload equality', () => {
  expect(JSON.stringify(reordered())).not.toBe(JSON.stringify(event));
  assertSingleProgressDelivery([request(reordered())], event);
});
test('progress mutation: a reordered duplicate is counted before payload comparison', () => {
  expect(() => assertSingleProgressDelivery([request(event), request(reordered())], event)).toThrow(/Count identity matches/);
});
test('progress mutation: a changed-payload duplicate is counted before payload comparison', () => {
  expect(() => assertSingleProgressDelivery([request(event), request({ ...event, summary: 'Changed.' })], event))
    .toThrow(/Count identity matches/);
});
test('progress mutation: one identity match with altered payload fails exact comparison', () => {
  expect(() => assertSingleProgressDelivery([request({ ...event, summary: 'Changed.' })], event)).toThrow(/Changed/);
});
test('other protocol identities and endpoints are not the original delivery', () => {
  assertSingleProgressDelivery([request(event), ...['actionId', 'operationId', 'eventId', 'sequence'].map(field =>
    request({ ...event, [field]: field === 'sequence' ? 3 : 'other' })),
  { ...request(event), method: 'GET' }, { ...request(event), url: 'http://offline.invalid/api/operations/stop-decision' }], event);
});
