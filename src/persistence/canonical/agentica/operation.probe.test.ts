// @vitest-environment node
import { expect, it } from 'vitest';
import { operationCustodyProbe } from './operation.probe';
import { protocolAction, protocolResult } from './types.test-support';

const admission = () => ({ ...protocolResult(), operation: { operationId: 'navigation', summary: 'Navigate earned cells.' } });

it('derives a deterministic zero-step probe with the exact original admission observation', () => {
  const action = protocolAction(), result = admission(), observation = structuredClone(result.observation);
  const probe = operationCustodyProbe('host', action, result, 'confirm');
  expect(probe).toMatchObject({ eventId: 'custody-confirm', sequence: 1, kind: 'progress', operationId: 'navigation', usage: { steps: 0 } });
  expect(probe.observation).toEqual(observation);
  expect(operationCustodyProbe('host', action, result, 'confirm')).toEqual(probe);
  result.observation!.data.changed = true; action.sessionId = 'changed';
  expect(probe.observation).toEqual(observation); expect(probe.sessionId).toBe('session');
  expect(operationCustodyProbe('host', protocolAction(), admission(), 'other').eventId).not.toBe(probe.eventId);
});

it('never substitutes a missing admission observation or operation', () => {
  const missing = admission(); delete missing.observation;
  expect(() => operationCustodyProbe('host', protocolAction(), missing, 'confirm')).toThrow('original admission observation');
  expect(() => operationCustodyProbe('host', protocolAction(), protocolResult(), 'confirm')).toThrow('original admission observation');
});

it('bounds the event including identity prefix and original observation', () => {
  expect(() => operationCustodyProbe('host', protocolAction(), admission(), 'x'.repeat(122))).toThrow('wire identity');
  const oversized = admission(); oversized.observation!.data.extra = 'x'.repeat(4096);
  expect(() => operationCustodyProbe('host', protocolAction(), oversized, 'confirm')).toThrow('4096 bytes');
});
