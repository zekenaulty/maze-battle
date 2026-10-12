import { integer } from '../../domain/agentic/knowledge/shared';
import { requireMemory, type MemoryWork } from './types';

export function memoryBudget(input: MemoryWork = {}) {
  const maxReads = input.maxReads ?? 8192, maxWrites = input.maxWrites ?? 8192;
  requireMemory(integer(maxReads, 1, 65536) && integer(maxWrites, 1, 65536));
  let reads = 0, writes = 0;
  const check = () => {
    if (input.signal?.aborted) throw new DOMException('Memory work cancelled.', 'AbortError');
  };
  return {
    check,
    read() { check(); if (++reads > maxReads) throw new Error('RPG memory read budget exhausted.'); },
    write() { check(); if (++writes > maxWrites) throw new Error('RPG memory write budget exhausted.'); },
    stats: () => ({ reads, writes }),
  };
}
export type MemoryBudget = ReturnType<typeof memoryBudget>;
