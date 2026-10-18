import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalRecord } from '../../src/persistence/canonical/types';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return { bytes: bytes.length, sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') };
}

/** One readonly transaction captures every key and value, including historical and unreachable rows. */
export async function readPendingCanonicalEvidence() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly');
    const rows: { store: typeof CANONICAL_STORES[number]; keys: unknown[]; values: unknown[] }[] = [];
    for (const store of CANONICAL_STORES) {
      const source = tx.objectStore(store);
      rows.push({ store, keys: await source.getAllKeys(), values: await source.getAll() });
    }
    await tx.done;
    const records = rows.find(row => row.store === 'records')!.values as CanonicalRecord[];
    const stores = [];
    for (const row of rows) stores.push({ store: row.store, count: row.keys.length, ...await digest(row) });
    const effects = records.filter(row => row.area === 'world' || row.area === 'knowledge');
    const publications = records.filter(row => row.area === 'execution'
      && (row.key.startsWith('agentica/publications/') || row.key.startsWith('agentica/publication-selections/')));
    return { stores, effects: { count: effects.length, ...await digest(effects) },
      publications: { count: publications.length, ...await digest(publications) } };
  } finally { db.close(); }
}
