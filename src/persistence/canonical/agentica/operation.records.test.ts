// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { protocolHead } from './types.test-support';
import { writeOperationRecord } from './operation.records';

it('bounds escaped full-record source witness, not merely the raw record', async () => {
  const head = protocolHead(), request: CanonicalRequest = { operation: 'agentica.operation.confirm', attemptId: 'confirm', input: {},
    expected: canonicalFence(head), deadlineAt: null };
  const set = vi.fn(async (_area, key, value) => ({ generation: head.generation, gameId: head.gameId, id: 'record', key,
    area: 'execution', indexes: [], revision: head.revision + 1, value }));
  const tx = { head, pages: { get: vi.fn(async () => null), set } } as unknown as CanonicalWork;
  await expect(writeOperationRecord(tx, request, 'agentica/operations/test/confirmation', 'fixture', { text: '"'.repeat(3500) })).rejects.toThrow('12288 bytes');
  expect(set).toHaveBeenCalledOnce();
  // The enclosing canonical transaction aborts this staged write; native store-failure tests cover that boundary.
});
