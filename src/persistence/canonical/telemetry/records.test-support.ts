import { vi } from 'vitest';
import { protocolHead } from '../agentica/types.test-support';
import type { CanonicalPages } from '../pages';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRecord } from '../types';
import { recordGameplay } from './records';
import type { GameplayFact, RewardFact } from './types';

export const rewardFact = (): RewardFact => ({ kind: 'reward', command: 'claim-quest', targetId: 'quest',
  walletGoldBefore: 1, walletGoldAfter: 8, lootAwardCount: 0 });

/** Record-shape/IO-bound mock only. Lifecycle tests use the actual canonical kernel separately. */
export function traceFixture() {
  const head = protocolHead(); head.revision = 0;
  const records = new Map<string, CanonicalRecord>();
  const get = vi.fn<CanonicalPages['get']>(async (area, key) => {
    if (area !== 'execution') throw Error('Trace must use execution'); return structuredClone(records.get(key));
  });
  const set = vi.fn<CanonicalPages['set']>(async (area, key, value, indexes = []) => {
    const row: CanonicalRecord = { generation: head.generation, gameId: head.gameId, id: crypto.randomUUID(),
      revision: head.revision + 1, area, key, value, indexes };
    records.set(key, structuredClone(row)); return row;
  });
  const scan = vi.fn(() => { throw Error('No trace scan'); });
  const tx = { head, pages: { get, set, scan } as unknown as CanonicalPages } as CanonicalWork;
  const append = async (fact: GameplayFact = rewardFact()) => {
    await recordGameplay(tx, fact, '2026-10-24T00:00:00.000Z'); head.revision++;
  };
  return { head, records, get, set, scan, tx, append };
}
