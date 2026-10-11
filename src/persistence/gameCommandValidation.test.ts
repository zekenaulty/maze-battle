import { describe, expect, it } from 'vitest';
import type { GameCommandRequest } from './gameCommandTypes';
import { commandFingerprint, validateCommandReceipt } from './gameCommandValidation';

const request: GameCommandRequest = { attemptId: 'a', gameId: 'g', floor: 1, position: { row: 0, column: 1 },
  control: { owner: 'owner', epoch: 1, revision: 10 }, deadlineAt: 1000,
  command: { type: 'move', direction: 'east', triggerStairs: false } };

describe('internal command identity validation', () => {
  it('uses stable SDK JSON canonicalization independent of property order', () => {
    expect(commandFingerprint(request)).toBe(commandFingerprint({ ...request, position: { column: 1, row: 0 } }));
    expect(commandFingerprint(request)).not.toBe(commandFingerprint({ ...request, deadlineAt: 1001 }));
  });
  it.each([
    { ...request, attemptId: '' }, { ...request, deadlineAt: NaN }, { ...request, floor: 0 },
    { ...request, command: { ...request.command, direction: 'sideways' } },
    { ...request, hidden: 'ignored?' }, { ...request, command: { type: 'open-chest', chestId: 'x', extra: true } },
  ])('refuses malformed input before canonicalization', value => {
    expect(() => commandFingerprint(value as GameCommandRequest)).toThrow('Invalid game command');
  });
  it('validates terminal receipts and refuses identity, outcome and revision corruption', () => {
    const fingerprint = commandFingerprint(request);
    const receipt = { version: 1, attemptId: 'a', gameId: 'g', fingerprint, beforeRevision: 10,
      afterRevision: 11, committedAt: 900, outcome: { status: 'applied', reason: 'moved' } };
    expect(validateCommandReceipt(receipt, request, fingerprint)).toBe(receipt);
    for (const change of [{ gameId: 'other' }, { afterRevision: 10 }, { fingerprint: '{}' },
      { outcome: { status: 'applied', reason: 'opened' } }, { outcome: { status: 'pending', reason: 'moved' } }]) {
      expect(() => validateCommandReceipt({ ...receipt, ...change }, request, fingerprint)).toThrow();
    }
  });
});
