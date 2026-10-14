import { describe, expect, it } from 'vitest';
import { controlInput, type ControlAction } from './controlValidation';
import type { CanonicalRequest, Json } from './types';

const request = (action: ControlAction, input: Json): CanonicalRequest => ({ attemptId: 'attempt', operation: `control.${action}`,
  expected: { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1, revision: 1 }, input, deadlineAt: null });

describe('explicit custody recovery intent', () => {
  it('keeps ordinary claim and resume on normal quota', () => {
    expect(controlInput(request('claim', { owner: 'replacement' }), 'claim')).toEqual({ action: 'claim', owner: 'replacement', recovery: false });
    expect(controlInput(request('resume', { owner: 'owner' }), 'resume').recovery).toBe(false);
  });
  it('permits an explicit foreign-owner recovery claim', () => {
    expect(controlInput(request('claim', { owner: 'replacement', recovery: true }), 'claim'))
      .toEqual({ action: 'claim', owner: 'replacement', recovery: true });
  });
  it.each(['stop', 'takeover'] as const)('preserves %s recovery accounting', action => {
    expect(controlInput(request(action, { owner: 'owner' }), action).recovery).toBe(true);
  });
  it.each([false, null, 1, 'true'])('rejects non-opt-in recovery metadata: %s', recovery => {
    expect(() => controlInput(request('claim', { owner: 'replacement', recovery }), 'claim')).toThrow('control fields');
  });
  it.each(['stop', 'takeover', 'resume'] as const)('does not extend %s input authority', action => {
    expect(() => controlInput(request(action, { owner: 'owner', recovery: true }), action)).toThrow('control fields');
  });
  it('requires a different owner and rejects additional fields', () => {
    expect(() => controlInput(request('claim', { owner: 'owner', recovery: true }), 'claim')).toThrow('new owner');
    expect(() => controlInput(request('claim', { owner: 'replacement', recovery: true, resume: true }), 'claim')).toThrow('control fields');
  });
  it('does not mutate or retain mutable request input', () => {
    const input = { owner: 'replacement', recovery: true }, original = request('claim', input);
    const intent = controlInput(original, 'claim'); input.owner = 'changed';
    expect(intent.owner).toBe('replacement'); expect(original.input).toBe(input);
  });
});
