import { readCanonical } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalSnapshot } from '../../src/persistence/canonical/types';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { readFrontiers, isCurrentFrontier, type FrontierSelection } from '../../src/persistence/canonical/knowledge/frontiers';
import type { KnowledgeRead } from '../../src/persistence/canonical/knowledge/types';
import { REGION_WORK_LIMITS } from '../../src/persistence/canonical/knowledge/region';

export async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [];
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name);
      rows.push([name, await store.getAllKeys(), await store.getAll()]);
    }
    await tx.done; return JSON.stringify(rows);
  } finally { db.close(); }
}

export function knowledgeOnly(pages: KnowledgeRead, accesses: string[]): KnowledgeRead {
  const check = (area: string, key: string) => {
    if (area !== 'knowledge') throw Error(`Frontier query attempted hidden ${area} read`);
    accesses.push(key);
  };
  return {
    get: (area, key) => { check(area, key); return pages.get(area, key); },
    witness: (area, prefix) => { check(area, prefix); return pages.witness(area, prefix); },
    scan: async () => { throw Error('Frontier query attempted a scan'); },
  };
}

export async function query(snapshot?: CanonicalSnapshot) {
  const accesses: string[] = [];
  const result = await readCanonical<FrontierSelection[]>((pages, pinned) => readFrontiers(knowledgeOnly(pages, accesses), gameCheckpoint(pinned.checkpoint)),
    { snapshot, limits: { ...REGION_WORK_LIMITS } });
  return { ...result, accesses };
}
export function current(selection: FrontierSelection) {
  return readCanonical((pages, snapshot) => isCurrentFrontier(knowledgeOnly(pages, []), gameCheckpoint(snapshot.checkpoint), selection),
    { limits: { ...REGION_WORK_LIMITS } });
}
export async function refusal(run: () => Promise<unknown>) {
  try { await run(); return { rejected: false, message: '' }; }
  catch (cause) { return { rejected: true, message: String(cause) }; }
}
