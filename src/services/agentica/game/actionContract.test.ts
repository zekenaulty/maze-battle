// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionFingerprint, actionKey } from '../sdk/agentica-host.mjs';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { actionResult, captureBinding, pinDeadline, sdkRecord } from './actionContract';

describe('SDK boundary input ownership', () => {
  it('owns pending and completed SDK records and rejects key/fingerprint drift', () => {
    const action = protocolAction(), key = actionKey(action), pending = { fingerprint: actionFingerprint(action), status: 'pending' as const };
    expect(sdkRecord(key, pending).action).toEqual(action);
    expect(sdkRecord(key, { ...pending, status: 'completed', result: protocolResult(action) }).record.status).toBe('completed');
    expect(() => sdkRecord(`${key} `, pending)).toThrow('identity');
    expect(() => sdkRecord(key, { ...pending, fingerprint: JSON.stringify(action) })).toThrow('identity');
    expect(() => sdkRecord(key, { ...pending, result: protocolResult(action) })).toThrow('record');
    expect(() => sdkRecord(key, { ...pending, status: 'completed' })).toThrow('record');
  });
  it('captures grant and publication references before yielding', () => {
    const binding = { grant: { key: 'agentica/launch/grant', id: 'grant' }, publication: { key: 'agentica/publication', id: 'publication' } };
    const copy = captureBinding(binding); binding.grant.id = 'changed'; binding.publication.id = 'changed';
    expect(copy.grant.id).toBe('grant'); expect(copy.publication.id).toBe('publication');
  });
  it('only tightens the original kernel deadline without replacing attempt or fence', () => {
    const action = protocolAction(), deadline = Date.parse(action.deadlineAt);
    const request = { attemptId: 'original', deadlineAt: deadline + 1000 } as CanonicalRequest;
    expect(pinDeadline(request, action)).toEqual({ ...request, deadlineAt: deadline });
    expect(request.deadlineAt).toBe(deadline + 1000);
    request.deadlineAt = deadline - 1000;
    expect(pinDeadline(request, action)).toEqual(request);
  });
  it('gives scoped results stable action-specific observations without changing publication evidence', async () => {
    const action = protocolAction(), identity = await prepareAction(action);
    const source = { observationId: 'publication', revision: action.expectedRevision,
      observedAt: '2026-10-15T00:00:00Z', data: { scope: 'map', source: { id: 'earned-sight', sequence: 2 } } };
    const before = structuredClone(source), result = actionResult(identity, source, 'Earned map');
    const repeated = actionResult(await prepareAction(structuredClone(action)), structuredClone(source), 'Earned map');
    const next = actionResult(await prepareAction({ ...action, actionId: 'other-action' }), source, 'Earned map');
    expect(result.observation?.observationId).not.toBe(source.observationId);
    expect(result.observation?.observationId).toMatch(/^observation-[0-9a-f]{64}$/);
    expect(repeated).toEqual(result);
    expect(next.observation?.observationId).not.toBe(result.observation?.observationId);
    expect(source).toEqual(before);
    expect(result.observation).toEqual({ ...source, observationId: result.observation!.observationId });
    source.data.source.id = 'mutated';
    expect(result.observation?.data).toEqual(before.data);
  });
  it('does not reuse the initial observation identity for navigation admission', async () => {
    const identity = await prepareAction(protocolAction());
    const sight = { observationId: 'publication', revision: identity.action.expectedRevision + 3,
      observedAt: '2026-10-15T00:00:00Z', data: { revisionContext: { kind: 'navigation-admission' } } };
    const result = actionResult(identity, sight, 'Destination admitted');
    expect(result.observation?.observationId).not.toBe(sight.observationId);
    expect(result.afterRevision).toBe(sight.revision);
    expect(result.observation?.revision).toBe(sight.revision);
    expect(result.observation?.observedAt).toBe(sight.observedAt);
  });
});
