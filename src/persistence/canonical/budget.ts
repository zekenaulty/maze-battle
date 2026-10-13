import { check, integer } from './validation';
import { DEFAULT_WORK_LIMITS, type CanonicalWorkLimits, type CanonicalWorkStats } from './types';

export function workBudget(limits: CanonicalWorkLimits = DEFAULT_WORK_LIMITS, signal?: AbortSignal) {
  check(integer(limits.reads, 1) && integer(limits.writes, 1) && integer(limits.bytes, 1), 'invalid work budget');
  const cap = { ...limits }, stats: CanonicalWorkStats = { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 };
  const alive = () => { if (signal?.aborted) throw new DOMException('Canonical work cancelled', 'AbortError'); };
  const received = (bytes: number) => {
    alive(); check(integer(bytes), 'invalid byte charge'); stats.readBytes += bytes;
    check(stats.readBytes + stats.writeBytes <= cap.bytes, 'read budget exhausted');
  };
  return {
    alive,
    read(bytes = 0) {
      alive(); check(stats.reads < cap.reads, 'read budget exhausted'); stats.reads++; received(bytes);
    },
    received,
    write(bytes: number) {
      alive(); check(integer(bytes), 'invalid byte charge'); stats.writes++; stats.writeBytes += bytes;
      check(stats.writes <= cap.writes && stats.readBytes + stats.writeBytes <= cap.bytes, 'write budget exhausted');
    },
    snapshot: () => ({ ...stats }),
  };
}
export type WorkBudget = ReturnType<typeof workBudget>;
