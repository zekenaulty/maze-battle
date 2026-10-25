import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { bootstrapModule } from '../../../domain/expedition/topology/modules/step';
import { initializeCanonical, resetCanonical } from '../lifecycle';
import { openCanonicalDatabase } from '../database';
import { marker } from '../validation';
import { seedRoster } from '../roster/write';
import { createWorldFloor } from '../world/generation';
import { checkpointJson, rosterContext, type GameCheckpoint } from './checkpoint';
import { SETTINGS_KEY } from './settings';
import { captureInitializationBoot } from './initializationBoot';
import { floorPreparationSpec } from './floorCapacity';

export async function hasCanonicalGame(signal?: AbortSignal) {
  const db = await openCanonicalDatabase(signal);
  try { const schema = await db.get('meta', 'schema'); marker(schema); return schema.gameId !== null; }
  finally { db.close(); }
}
/** Fresh schema only. Existing data is never guessed, migrated or silently reset. */
export function createCanonicalGame(owner: string, reset = false, signal?: AbortSignal) {
  const worldId = crypto.randomUUID(), seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const recipe = createModuleRecipe(worldId, 1, seed, { spatial: true }), initial = bootstrapModule(recipe).space;
  const boot = captureInitializationBoot(worldId), allocation = floorPreparationSpec(recipe);
  const now = new Date().toISOString();
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual',
    position: { level: 1, cell: { spaceId: initial.id, row: Math.floor(initial.rows / 2), column: Math.floor(initial.columns / 2) } },
    knowledge: null, facing: 'south', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  return (reset ? resetCanonical : initializeCanonical)(owner, checkpointJson(checkpoint), async pages => {
    await createWorldFloor(pages, recipe);
    await pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
    await pages.set('world', SETTINGS_KEY, boot.settings);
    await seedRoster(pages, { ...rosterContext(checkpoint), ...boot.roster });
  }, { signal, privatePreparation: allocation });
}
