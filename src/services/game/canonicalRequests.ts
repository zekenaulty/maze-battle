import { canonicalFence } from '../../persistence/canonical/transaction';
import type { CanonicalHead, CanonicalRequest, Json } from '../../persistence/canonical/types';

export function gameRequest(head: CanonicalHead, operation: string, input: Json): CanonicalRequest {
  return { attemptId: crypto.randomUUID(), expected: canonicalFence(head), operation, input, deadlineAt: Date.now() + 120_000 };
}
