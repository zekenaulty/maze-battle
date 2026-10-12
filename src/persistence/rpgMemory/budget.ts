import { integer } from '../../domain/agentic/knowledge/shared';
import { requireMemory, type MemoryWork } from './types';

export function memoryBudget(input: MemoryWork = {}) {
  const maxReads = input.maxReads ?? 8192, maxWrites = input.maxWrites ?? 8192, signal = input.signal;
  requireMemory(integer(maxReads, 1, 65536) && integer(maxWrites, 1, 65536));
  let reads = 0, writes = 0;
  const check = () => {
    if (signal?.aborted) throw new DOMException('Memory work cancelled.', 'AbortError');
  };
  return {
    check,
    watch(transaction: { abort(): void }) {
      const abort = () => { try { transaction.abort(); } catch { /* The transaction already settled. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      return () => signal?.removeEventListener('abort', abort);
    },
    read() { check(); if (++reads > maxReads) throw new Error('RPG memory read budget exhausted.'); },
    write() { check(); if (++writes > maxWrites) throw new Error('RPG memory write budget exhausted.'); },
    stats: () => ({ reads, writes }),
  };
}
export type MemoryBudget = ReturnType<typeof memoryBudget>;
