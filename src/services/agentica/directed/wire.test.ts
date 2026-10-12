import { describe, expect, it } from 'vitest';
import { equivalentHostWire } from './wire';

describe('directed wire reconciliation', () => {
  const original = { eventId: 'event', observation: { observedAt: '2026-10-10T12:00:00.100Z', data: { historical: '2026-10-10T12:00:00.100Z' } } };
  it('accepts typed .NET timestamp and optional null formatting without rewriting either value', () => {
    const service = { ...structuredClone(original), completion: null, nextSessionEpoch: null,
      observation: { ...structuredClone(original.observation), observedAt: '2026-10-10T12:00:00.1+00:00' } };
    const before = structuredClone(service);
    expect(equivalentHostWire(original, service, 'event')).toBe(true);
    expect(service).toEqual(before);
  });
  it('does not normalize arbitrary history, drop extra fields, or hide timestamp changes', () => {
    expect(equivalentHostWire(original, { ...original, hidden: null }, 'event')).toBe(false);
    expect(equivalentHostWire(original, { ...original, observation: { ...original.observation,
      data: { historical: '2026-10-10T12:00:00.1+00:00' } } }, 'event')).toBe(false);
    expect(equivalentHostWire(original, { ...original, observation: { ...original.observation,
      observedAt: '2026-10-10T12:00:00.1000001+00:00' } }, 'event')).toBe(false);
  });
  it('normalizes only the typed optional admission usage field', () => {
    const result = { ...original, operation: { operationId: 'journey', summary: 'Accepted' } };
    const service = { ...structuredClone(result), operation: { ...result.operation, usage: null } };
    expect(equivalentHostWire(result, service, 'result')).toBe(true);
    expect(service.operation).toHaveProperty('usage', null);
    expect(equivalentHostWire(result, { ...service, operation: { ...service.operation, usage: {} } }, 'result')).toBe(false);
    expect(equivalentHostWire(result, { ...result, observation: { ...result.observation, data: { usage: null } } }, 'result')).toBe(false);
    expect(equivalentHostWire(result, service, 'event')).toBe(false);
  });
});
