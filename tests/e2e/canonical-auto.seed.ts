import { createInitialParty } from '../../src/domain/party/factory';
import { createInitialInventory, createInitialStash } from '../../src/domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../src/domain/items/inventoryPolicy';
import { createModuleRecipe, type ModulePolicy } from '../../src/domain/expedition/topology/modules/policy';
import { bootstrapModule } from '../../src/domain/expedition/topology/modules/step';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { createWorldFloor } from '../../src/persistence/canonical/world/generation';
import { seedRoster } from '../../src/persistence/canonical/roster/write';
import { checkpointJson, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { prepare } from './canonical-content-fixture';
import { act } from './canonical-knowledge-fixture';

export interface AutoSeed { seed: number; rooms: number; minSide: number; maxSide: number; joins: ModulePolicy['joins'] }
/** Test-only authoritative setup. No fixture layout or oracle is passed to Auto. */
export async function seedAuto(options: AutoSeed) {
  if (!Number.isSafeInteger(options.rooms) || options.rooms < 3 || options.rooms > 16) throw Error('Auto fixture room budget exceeded');
  const recipe = { ...createModuleRecipe('fixture-world', 1, options.seed), roomBudget: options.rooms };
  recipe.policy = { ...recipe.policy, minSide: options.minSide, maxSide: options.maxSide, joins: options.joins };
  const initial = bootstrapModule(recipe).space, now = new Date().toISOString();
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'auto-play',
    position: { level: 1, cell: { spaceId: initial.id, row: Math.floor(initial.rows / 2), column: Math.floor(initial.columns / 2) } },
    knowledge: null, facing: 'south', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  await initializeCanonical('owner', checkpointJson(checkpoint), async pages => {
    await createWorldFloor(pages, recipe);
    await seedRoster(pages, { ...rosterContext(checkpoint), party: createInitialParty('fixture-world'), inventory: createInitialInventory(),
      stash: createInitialStash(), inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY, autoEquip: false } });
  });
  await prepare(); await act({ kind: 'look' });
}
