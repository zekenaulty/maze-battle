// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionFingerprint, actionKey } from '../sdk/agentica-host.mjs';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { captureBinding, pinDeadline, sdkRecord } from './actionContract';

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
});
