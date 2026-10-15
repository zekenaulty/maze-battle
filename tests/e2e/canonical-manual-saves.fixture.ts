import * as saves from '../../src/persistence/canonical/game/manualSaves';
import * as lifecycle from '../../src/persistence/canonical/lifecycle';
import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import * as roster from './canonical-roster-fixture';
import { worldRequest as command } from './canonical-world-fixture';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, MIN_TERMINAL_BYTES, type Json } from '../../src/persistence/canonical/types';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { storageProbe } from './storage-probe';
import { recordGameObservation } from '../../src/persistence/canonical/knowledge/write';
import { validateKnowledge, loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { prepare as prepareWorld } from './canonical-content-fixture';
import { DEFAULT_SETTINGS, SETTINGS_KEY, executeSettingsCommand } from '../../src/persistence/canonical/game/settings';
import { projectGame, projectGameSnapshot } from '../../src/persistence/canonical/game/projection';
import { GameSession } from '../../src/services/game/GameSession';

async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = []; let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const store = tx.objectStore(name), values = await store.getAll(), keys = await store.getAllKeys();
      rows.push([name, values]);
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done; return { content: JSON.stringify(rows), bytes };
  } finally { db.close(); }
}
async function change(value = 1) {
  const { head } = await reader.readCanonicalHead();
  return transaction.executeCanonical(command(head, 'fixture.change'), async tx => {
    await tx.pages.set('world', 'fixture/world', value);
    await tx.pages.set('knowledge', 'fixture/knowledge', value);
    await tx.pages.set('execution', 'fixture/execution', value);
    if (!await tx.pages.get('world', SETTINGS_KEY)) await tx.pages.set('world', SETTINGS_KEY, DEFAULT_SETTINGS);
    tx.setCheckpoint({ ...tx.head.checkpoint, wave: value + 1 }); return value;
  });
}
async function seed() { await roster.seed(); await change(0); return (await reader.readCanonicalHead()).head; }
async function act(input: Json) {
  const request = command((await reader.readCanonicalHead()).head, 'save.command', input);
  return { request, outcome: await saves.executeSaveCommand(request) };
}
async function create(label = 'Camp') { const result = await act({ kind: 'create', label }); return { ...result, id: result.request.attemptId }; }
if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5222') throw Error('Isolated manual save fixture only');
const api = { ...saves, ...lifecycle, ...transaction, ...reader, roster, command, openCanonicalDatabase, dump, change, seed, act, create,
  MIN_TERMINAL_BYTES, canonicalJson, storageProbe, recordGameObservation, validateKnowledge, loadObservation, prepareWorld,
  SETTINGS_KEY, executeSettingsCommand, projectGame, projectGameSnapshot, GameSession };
declare global { interface Window { manualSaves: typeof api } }
window.manualSaves = api;
