import { test, expect, fixture } from './rpg-command-browser';

test('v4 source evidence and save heads survive v5 migration and seed the derived cache unchanged', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, game = h.game();
    game.maze.visibility = { radius: 0, explored: [] };
    const revision = { owner: 'v4-owner', epoch: 1, revision: 1 }, id = 'v4-source';
    const observation = { status: 'observed', version: 1, id, gameId: game.id, revision,
      observedAt: '2026-10-11T00:00:00.000Z', actor: { floor: 1, row: 0, column: 1 },
      policy: { kind: 'rpg-linked-bfs-v1', radius: 0 }, cells: [{ address: { floor: 1, row: 0, column: 1 },
        roomIds: [], chests: [], stairs: [], links: [], blocked: ['north', 'south'] }] };
    const node = { version: 1, id, gameId: game.id, depth: 1, ancestors: [], observation,
      lineage: JSON.stringify({ ancestors: [], depth: 1, gameId: game.id, id }) };
    const slot = { slotId: 'auto', label: 'Original v4', kind: 'auto', createdAt: game.createdAt,
      updatedAt: game.updatedAt, game, observationHead: id };
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('maze-battle', 4);
      open.onupgradeneeded = () => {
        const db = open.result, saves = db.createObjectStore('saves', { keyPath: 'slotId' });
        saves.createIndex('byKind', 'kind'); saves.createIndex('byUpdatedAt', 'updatedAt');
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('telemetry', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
        db.createObjectStore('observations', { keyPath: 'id' }).createIndex('byGameId', 'gameId');
        db.createObjectStore('gameCommands', { keyPath: 'attemptId' }).createIndex('byGameId', 'gameId');
      };
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction(['saves', 'meta', 'observations'], 'readwrite');
      tx.objectStore('saves').put(slot); tx.objectStore('observations').put(node);
      tx.objectStore('meta').put({ key: 'control:auto', value: JSON.stringify(revision) });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    old.close();
    const db = await h.repository.getDatabase(), prepared = await h.memory.prepareRpgMemory();
    return { version: db.version, prepared, slot, node, saved: await db.get('saves', 'auto'),
      source: await db.get('observations', id), revision, control: (await h.custody.readGameControl()).control,
      memory: await h.memory.readRpgCells('auto', [1, 2].map(column => ({ floor: 1, row: 0, column }))) };
  });
  expect(result.version).toBe(5);
  expect(result.prepared.status).toBe('ready');
  expect(result.saved).toEqual(result.slot);
  expect(result.source).toEqual(result.node);
  expect(result.control).toEqual(result.revision);
  expect(result.memory).toMatchObject({ status: 'ready', data: { cells: [{ address: { column: 1 } }], unknown: [{ column: 2 }] } });
});
