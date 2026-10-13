// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionFingerprint, actionKey } from '../../../services/agentica/sdk/agentica-host.mjs';
import { MAX_ACTION_BYTES, MAX_RESULT_BYTES } from './types';
import { prepareAction, validateAction, validatePrepared } from './validation';
import { validateResult } from './validation.result';
import { protocolAction, protocolResult } from './types.test-support';

describe('exact SDK action identities', () => {
  it('retains all SDK input fields with a deterministic bounded storage key and negative coordinates', async () => {
    const action = protocolAction(), first = await prepareAction(action), second = await prepareAction(structuredClone(action));
    expect(first.key).toBe(actionKey(action)); expect(first.fingerprint).toBe(actionFingerprint(action));
    expect(JSON.parse(first.fingerprint)).toEqual(action); expect(first.storageKey).toBe(second.storageKey);
    expect(first.storageKey).toMatch(/^agentica\/actions\/[a-f0-9]{64}$/);
    action.arguments.row = 10; expect(first.action.arguments.row).toBe(-5);
  });
  it('bounds keys even for four maximum-length Unicode wire identities', async () => {
    const action = protocolAction(); for (const key of ['sessionId', 'sessionEpoch', 'runId', 'actionId'] as const) action[key] = 'x'.repeat(127) + '\u00e9';
    const prepared = await prepareAction(action); expect(prepared.key.length).toBeGreaterThan(384); expect(prepared.storageKey.length).toBeLessThan(128);
  });
  it.each(['arguments', 'expectedRevision', 'deadlineAt', 'manifestHash', 'runnerRunId', 'stepId'] as const)
    ('retains changed %s in the fingerprint, never in a replacement key', async field => {
      const action = protocolAction(), first = await prepareAction(action);
      if (field === 'arguments') action.arguments.column = 3;
      else if (field === 'expectedRevision') action.expectedRevision++;
      else if (field === 'deadlineAt') action.deadlineAt = '2026-10-14T00:00:00.000Z';
      else if (field === 'manifestHash') action.manifestHash = `sha256:${'b'.repeat(64)}`;
      else action[field] = 'different';
      const next = await prepareAction(action); expect(next.key).toBe(first.key); expect(next.storageKey).toBe(first.storageKey);
      expect(next.fingerprint).not.toBe(first.fingerprint);
    });
  it('requires preparation outside the transaction and rejects mutation or forged lookup hashes', async () => {
    const prepared = await prepareAction(protocolAction()); expect(() => validatePrepared(prepared)).not.toThrow();
    expect(() => validatePrepared({ ...prepared })).toThrow('prepare');
    expect(() => validatePrepared({ ...prepared, storageKey: 'agentica/actions/collision' })).toThrow('prepare');
    prepared.action.arguments.row = 0; expect(() => validatePrepared(prepared)).toThrow('prepare');
  });
  it('rejects accessors without invoking them, hidden fields, cycles and oversized inputs', () => {
    let reads = 0; const accessor = { ...protocolAction() };
    Object.defineProperty(accessor, 'arguments', { get: () => { reads++; return {}; }, enumerable: true });
    expect(() => validateAction(accessor)).toThrow(); expect(reads).toBe(0);
    expect(() => validateAction({ ...protocolAction(), hidden: true })).toThrow();
    const cycle = protocolAction(); cycle.arguments.self = cycle;
    expect(() => validateAction(cycle)).toThrow();
    expect(() => validateAction({ ...protocolAction(), arguments: { text: 'x'.repeat(MAX_ACTION_BYTES) } })).toThrow();
  });
});

describe('bounded exact result validation', () => {
  it('accepts a pinned read-only result and a separately numbered durable admission', () => {
    const action = protocolAction(), result = protocolResult(action);
    expect(validateResult(result, action, 'readOnly')).toEqual(result);
    const admitted = { ...result, afterRevision: 10, observation: { ...result.observation!, revision: 10 }, operation: { operationId: 'navigation', summary: 'Admitted, not arrived.' } };
    expect(validateResult(admitted, action, 'writesLocalState')).toEqual(admitted);
    expect(() => validateResult(admitted, action, 'readOnly')).toThrow('non-effect');
  });
  it.each(['actionId', 'sessionId', 'sessionEpoch'] as const)('rejects a changed result %s', field => {
    expect(() => validateResult({ ...protocolResult(), [field]: 'other' }, protocolAction(), 'readOnly')).toThrow('identity');
  });
  it.each(['unresolved', 'invented'])('does not store %s as an exact completion', disposition => {
    expect(() => validateResult({ ...protocolResult(), disposition }, protocolAction(), 'readOnly')).toThrow();
  });
  it('requires exact revisions, observation shape and bounded payload', () => {
    for (const patch of [{ beforeRevision: 6 }, { afterRevision: 8 }, { evidenceId: '' }, { extra: true },
      { observation: { ...protocolResult().observation, revision: 8 } }, { summary: 'x'.repeat(MAX_RESULT_BYTES) }])
      expect(() => validateResult({ ...protocolResult(), ...patch }, protocolAction(), 'readOnly')).toThrow();
    const result = protocolResult(); delete result.observation;
    expect(() => validateResult(result, protocolAction(), 'readOnly')).toThrow('observation');
  });
  it('validates facts, operation envelopes and completion fields, not only outer JSON', () => {
    const result = protocolResult(), fact = { key: 'cell', summary: 'Known', value: true };
    expect(() => validateResult({ ...result, observation: { ...result.observation!, facts: [fact, fact] } }, protocolAction(), 'readOnly')).toThrow('duplicate');
    expect(() => validateResult({ ...result, operation: { operationId: '', summary: 'Bad' } }, protocolAction(), 'writesLocalState')).toThrow();
    expect(() => validateResult({ ...result, completion: { objectiveId: '', evidenceId: 'e', summary: 'Bad' } }, protocolAction(), 'readOnly')).toThrow();
  });
  it('rejects a result deeper than the vendored SDK allows, even below the byte cap', () => {
    let nested: unknown = {};
    for (let i = 0; i < 29; i++) nested = { child: nested };
    const result = protocolResult(); result.observation!.data = { nested };
    expect(() => validateResult(result, protocolAction(), 'readOnly')).toThrow('nesting');
  });
});
