// Schema metadata only, not legacy readers or playable old-save generators.
// v1-v7: d68b10c, eca2926, 58476db, 476bf50, 690f2b1, 6e035fc, 161e20f.
const stores = [
  { since: 1, name: 'saves', keyPath: 'slotId' },
  { since: 1, name: 'meta', keyPath: 'key' },
  { since: 2, name: 'telemetry', keyPath: 'gameId' },
  { since: 3, name: 'gameCommands', keyPath: 'attemptId' },
  { since: 4, name: 'observations', keyPath: 'id' },
  { since: 5, name: 'rpgMemoryNodes', keyPath: 'id' },
  { since: 5, name: 'rpgMemoryHeads', keyPath: 'id' },
  { since: 6, name: 'rpgTravels', keyPath: 'id' },
  { since: 6, name: 'rpgTravelActions', keyPath: 'attemptId' },
  { since: 7, name: 'rpgAgenticaRuns', keyPath: 'runId' },
  { since: 7, name: 'rpgAgenticaActions', keyPath: 'key' },
  { since: 7, name: 'rpgAgenticaOperations', keyPath: 'operationId' },
  { since: 7, name: 'rpgAgenticaEvents', keyPath: 'key' },
  { since: 7, name: 'rpgAgenticaAdvances', keyPath: 'attemptId' },
];

export const discardedMarker = 'discarded-issue-11-save';
const envelopes = ['classic', 'structured-v1', 'structured-v2', 'structured-v3', 'malformed'];
export const retiredSchemas = [
  ...Array.from({ length: 7 }, (_, i) => i + 1).flatMap(version => envelopes.map(envelope => ({
    version, envelope, stores: stores.filter(store => store.since <= version)
      .map(({ name, keyPath }) => ({ name, keyPath: keyPath as string | null })),
  }))),
  // First canonical schema (af0aad2), before operation capacity was reserved.
  { version: 8, envelope: 'canonical-v8', stores: ['meta', 'heads', 'records', 'nodes', 'receipts']
    .map(name => ({ name, keyPath: null as string | null })) },
];

export async function seedRetiredSchema(fixture: typeof retiredSchemas[number]) {
  const marker = 'discarded-issue-11-save';
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('maze-battle', fixture.version);
    open.onupgradeneeded = () => {
      for (const { name, keyPath } of fixture.stores) open.result.createObjectStore(name, keyPath ? { keyPath } : undefined);
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(fixture.stores.map(store => store.name), 'readwrite');
      for (const { name, keyPath } of fixture.stores) {
        const table = tx.objectStore(name);
        if (name === 'saves') {
          for (const kind of ['auto', 'manual']) table.put({
            slotId: kind, kind, label: marker, observationHead: marker,
            game: { id: marker, maze: fixture.envelope === 'malformed' ? null
              : { cells: [], ...(fixture.envelope === 'classic' ? {} : { layout: { version: fixture.envelope } }) } },
          });
        } else {
          const value = { discarded: marker, ...(keyPath ? { [keyPath]: marker } : {}) };
          if (keyPath) table.put(value); else table.put(value, marker);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Synthetic old schema aborted'));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
