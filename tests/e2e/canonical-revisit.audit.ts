import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint, rosterContext } from '../../src/persistence/canonical/game/checkpoint';
import { readKnownCells } from '../../src/persistence/canonical/knowledge/queries';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { CanonicalRecord, CanonicalReceipt } from '../../src/persistence/canonical/types';
import { earnedMemory } from './canonical-revisit.memory';

/** Independent audit only; never included in a measured action or used to choose movement. */
export async function capture(positions: WorldPosition[]) {
  const db = await openCanonicalDatabase();
  let records: CanonicalRecord[], receipts: CanonicalReceipt[];
  try { records = await db.getAll('records'); receipts = await db.getAll('receipts'); }
  finally { db.close(); }
  const keys = [...new Set(records.filter(row => row.area === 'world'
    && (/^dungeon\/[12](?:\/|$)/.test(row.key) || /^(quest|contract|roster)\//.test(row.key))).map(row => row.key))].sort();
  const selected: CanonicalRecord[] = [];
  for (let offset = 0; offset < keys.length; offset += 16) {
    selected.push(...(await readCanonical(async pages => {
      const found = [];
      for (const key of keys.slice(offset, offset + 16)) {
        // Immutable retired frontier rows remain on disk but are no longer selected.
        const row = await pages.get('world', key); if (row) found.push(row);
      }
      return found;
    })).value);
  }
  const projection = (await readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint);
    return { snapshot, checkpoint, memory: await readKnownCells(pages, checkpoint, positions),
      roster: (await loadRoster(pages, rosterContext(checkpoint))).state };
  })).value;
  return { ...projection, selected, known: await earnedMemory(records),
    immutable: records, receipts,
    counts: { records: records.length, receipts: receipts.length,
      observations: records.filter(row => /^perception\/observation\/\d+$/.test(row.key)).length } };
}
export async function retained(witness: Awaited<ReturnType<typeof capture>>) {
  const db = await openCanonicalDatabase();
  try {
    const missing: string[] = [], changed: string[] = [];
    for (const row of witness.immutable) {
      const actual = await db.get('records', [row.gameId, row.id]);
      if (!actual) missing.push(row.id);
      else if (JSON.stringify(actual) !== JSON.stringify(row)) changed.push(row.id);
    }
    for (const receipt of witness.receipts) {
      const actual = await db.get('receipts', [receipt.gameId, receipt.attemptId]);
      if (!actual) missing.push(receipt.attemptId);
      else if (JSON.stringify(actual) !== JSON.stringify(receipt)) changed.push(receipt.attemptId);
    }
    return { missing, changed };
  } finally { db.close(); }
}
export async function counts() {
  const db = await openCanonicalDatabase();
  try {
    const records = await db.getAll('records');
    return { records: records.length, receipts: await db.count('receipts'),
      observations: records.filter(row => /^perception\/observation\/\d+$/.test(row.key)).length };
  } finally { db.close(); }
}
