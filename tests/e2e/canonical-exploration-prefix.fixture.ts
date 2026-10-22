import { createInitialParty } from '../../src/domain/party/factory';
import { createInitialInventory, createInitialStash } from '../../src/domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../src/domain/items/inventoryPolicy';
import type { Direction } from '../../src/domain/types';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { checkpointJson, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { createWorldFloor } from '../../src/persistence/canonical/world/generation';
import { seedRoster } from '../../src/persistence/canonical/roster/write';
import { prepare } from './canonical-content-fixture';
import { act } from './canonical-knowledge-fixture';
import { ORIGINAL_PRELUDE } from './canonical-exploration-prefix.original';

// Earn the west-hand room early to retain bounded evidence for the later survey.
// Setup moves only. No placement, authored sight, altered geometry/content, or runtime route input.
const PRELUDE = 'SSSSSSSSEEEEEESSSSSSSWWWWWWWENNEEEEEENNNNNWWEEESSSSSSSSSSSSSSNWSWNW'
  + 'SWWEWNWWNNEEEEEENENWNNENWENNWSWENENNWENWSNWWENEEWWWSWNWWWWW';
const directions: Record<string, Direction> = { N: 'north', E: 'east', S: 'south', W: 'west' };

export async function seedPrefixScene(history: 'compact' | 'original' = 'compact') {
  const world = 'frontier-exploration-pair', now = new Date().toISOString();
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', knowledge: null,
    position: { level: 1, cell: { spaceId: 'entry', row: 7, column: 7 } },
    facing: 'south', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  const recipe = createModuleRecipe(world, 1, 66);
  Object.assign(recipe.policy, { minSide: 15, maxSide: 15, joins: 'direct' });
  const inventory = createInitialInventory();
  inventory.items = inventory.items.map(item => ({ ...item, id: item.baseId }));
  await initializeCanonical('owner', checkpointJson(checkpoint), async pages => {
    await createWorldFloor(pages, recipe);
    await seedRoster(pages, { ...rosterContext(checkpoint), party: createInitialParty(world), inventory,
      stash: createInitialStash(), inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY, autoEquip: false } });
  });
  await prepare();
  const prepared = (await readCanonicalHead()).head;
  await act({ kind: 'look' });
  const moves = [];
  for (const code of history === 'original' ? ORIGINAL_PRELUDE : PRELUDE) {
    const direction = directions[code], step = await act({ kind: 'move', direction, triggerStairs: false });
    const result = step.outcome.receipt.result as { moved?: boolean; position?: unknown; observation?: unknown };
    if (!result.moved || step.outcome.replayed) throw Error('Prefix setup must earn every adjacent move once');
    moves.push({ direction, position: result.position, observation: result.observation,
      attemptId: step.request.attemptId, revision: step.outcome.receipt.afterRevision, stats: step.outcome.stats });
  }
  return { recipe, prepared, moves, head: (await readCanonicalHead()).head };
}
