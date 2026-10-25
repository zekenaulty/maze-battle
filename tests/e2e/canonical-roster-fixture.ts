import { createInitialParty } from '../../src/domain/party/factory';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/persistence/canonical/game/settings';
import { createInitialInventory, createInitialStash, packSlotUsage } from '../../src/domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../src/domain/items/inventoryPolicy';
import { createItemInstance } from '../../src/domain/items/loot';
import type { RosterState } from '../../src/domain/party/roster';
import type { ItemInstance } from '../../src/domain/types';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { seedRoster, saveRoster } from '../../src/persistence/canonical/roster/write';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import { executeRosterCommand } from '../../src/persistence/canonical/game/rosterCommand';
import { checkpointJson, gameCheckpoint, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import type { RosterCommand } from '../../src/persistence/canonical/roster/commands';
import { encodeRoster } from '../../src/persistence/canonical/roster/codec';
import { createModuleRecipe, createWorldFloor, worldRequest } from './canonical-world-fixture';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { nodeWitness } from '../../src/persistence/rpgMemory/treeTypes';

export { createItemInstance, loadRoster, saveRoster, encodeRoster, executeRosterCommand, gameCheckpoint, rosterContext, checkpointJson, packSlotUsage };
export { commitRosterCommand } from '../../src/persistence/canonical/game/rosterCommand';
export { loadParty } from '../../src/persistence/canonical/roster/projection';
export async function seed(mode: GameCheckpoint['mode'] = 'manual', extra: ItemInstance[] = [], quota?: { limitBytes: number; reserveBytes: number }) {
  const now = new Date().toISOString();
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode, position: { level: 1, cell: { spaceId: 'entry', row: 4, column: 4 } },
    knowledge: null, facing: 'south', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  const inventory = createInitialInventory();
  inventory.items = [...inventory.items.map(item => ({ ...item, id: item.baseId })), ...extra];
  const state: RosterState = { ...rosterContext(checkpoint), party: createInitialParty('fixture-world'), inventory,
    stash: createInitialStash(), inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY, autoEquip: false } };
  return initializeCanonical('owner', checkpointJson(checkpoint), async pages => {
    await createWorldFloor(pages, { ...createModuleRecipe('fixture-world', 1, 1), roomBudget: 8 });
    await seedRoster(pages, state);
    await pages.set('world', SETTINGS_KEY, DEFAULT_SETTINGS);
  }, { quota });
}
export async function read() {
  return readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint), roster = await loadRoster(pages, rosterContext(checkpoint));
    return { state: roster.state, checkpoint, packSlots: packSlotUsage(roster.state),
      owners: [...roster.rows.items.values()].map(row => ({ id: row.item.id, owner: row.owner, order: row.order })) };
  });
}
export async function act(command: RosterCommand) {
  const { head } = await readCanonicalHead(), request = worldRequest(head, 'roster.command', encodeRoster(command));
  return { request, outcome: await executeRosterCommand(request) };
}
export async function edit(change: (state: RosterState) => RosterState) {
  const { head } = await readCanonicalHead();
  return executeCanonical(worldRequest(head, 'fixture.edit'), async tx => {
    const before = await loadRoster(tx.pages, rosterContext(gameCheckpoint(tx.head.checkpoint)));
    await saveRoster(tx.pages, before, change(before.state)); return { edited: true };
  });
}

export async function corruptIndexPointer(prefix: string, oldRecordId: string) {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    const tx = db.transaction('nodes', 'readwrite'), nodes = await tx.store.getAll();
    const targets = nodes.filter(row => row.gameId === head.gameId && row.node.prefix === `index/${prefix}`);
    if (!targets.length) throw Error('Missing corruption target');
    for (const row of targets) {
      row.node.value = oldRecordId; row.node.witness = nodeWitness(row.node);
      await tx.store.put(row, [row.gameId, row.node.id]);
    }
    await tx.done;
  } finally { db.close(); }
}
