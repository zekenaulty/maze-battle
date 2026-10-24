import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { executeSaveCommand } from '../../src/persistence/canonical/game/manualSaves';
import { createCanonicalGame } from '../../src/persistence/canonical/game/initialize';
import { floorPreparationSpec } from '../../src/persistence/canonical/game/floorCapacity';
import { prepareGameFloor } from '../../src/persistence/canonical/game/preparation';
import { privateAdmissionBytes } from '../../src/persistence/canonical/privateCapacity';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { loadFloor } from '../../src/persistence/canonical/world/records';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { command, current, dump } from './canonical-private-capacity.support';

export { executeSaveCommand };

export async function readyCapacityFloor(level: number) {
  const results = [];
  for (let n = 0; n < 64; n++) {
    const value = await prepareGameFloor(command(await current(), 'game.prepare', { level }));
    results.push(value);
    if ((value.receipt.result as { phase: string }).phase === 'ready') return results;
  }
  throw Error('Fixture floor did not finish within 64 preparation batches');
}

export async function capacityNextFloorSetup() {
  await createCanonicalGame('game-owner'); await readyCapacityFloor(1);
  const floor = (await readCanonical(pages => loadFloor(pages, 1))).value;
  if (!floor.exit) throw Error('Fixture floor has no descending stairs');
  // Capacity setup only: position at the established stairs, without claiming a played journey.
  await executeCanonical(command(await current(), 'fixture.at-stairs'), async tx => {
    tx.setCheckpoint({ ...tx.head.checkpoint, position: { level: 1, cell: { ...floor.exit! } }, knowledge: null });
    return { positionedAtStairs: true };
  });
  const recipe = createModuleRecipe(floor.generation.recipe.worldId, 2, floor.generation.recipe.seed + 1);
  return { head: await current(), specification: floorPreparationSpec(recipe) };
}

/** Test-only logical quota fault; continue charging every actual stored byte. */
export async function nextCapacityLimit(budgetBytes: number, margin: number) {
  const before = await current(), next = structuredClone(before);
  const raw = before.quota.usedBytes - storedBytes('heads', before.gameId, before);
  next.quota.limitBytes = privateAdmissionBytes(before.quota.privateCapacity!, before.quota.usedBytes,
    storedBytes('heads', before.gameId, before)) + budgetBytes + before.quota.reservedBytes + before.quota.reserveBytes + margin;
  for (let n = 0; n < 16; n++) {
    const usedBytes = raw + storedBytes('heads', next.gameId, next);
    if (usedBytes === next.quota.usedBytes) break;
    next.quota.usedBytes = usedBytes;
  }
  if (next.quota.usedBytes !== raw + storedBytes('heads', next.gameId, next)) throw Error('Fixture quota fixed point failed');
  const db = await openCanonicalDatabase();
  try { await db.put('heads', next, next.gameId); } finally { db.close(); }
  if ((await dump()).bytes !== next.quota.usedBytes) throw Error('Fixture occupancy is not truthful');
  return next;
}
