import { expect } from '@playwright/test';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { DeliveryFault } from './canonical-start-service.corpus-delivery.fault';

export function assertSingleCompletionAttempt(fault: DeliveryFault) {
  expect(fault.kind).toBe('completion');
  expect(fault.completionAttempts, 'Every attempt, including a rejected duplicate, is counted').toHaveLength(1);
  expect(fault.sent).toEqual(fault.completionAttempts);
}

export function assertSingleProgressDelivery(requests: { method: string; url: string; body?: unknown }[], original: HostOperationEvent) {
  const deliveries = requests.filter(request => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/operations/events') return false;
    const body = request.body;
    return body !== null && typeof body === 'object'
      && 'actionId' in body && body.actionId === original.actionId
      && 'operationId' in body && body.operationId === original.operationId
      && 'eventId' in body && body.eventId === original.eventId
      && 'sequence' in body && body.sequence === original.sequence;
  });
  expect(deliveries, 'Count identity matches before checking the full payload').toHaveLength(1);
  expect(deliveries[0].body).toEqual(original);
}
