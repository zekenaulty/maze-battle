import { createInitialInventory, createInitialStash } from '../domain/items/inventory';
import { checkpointJson, rosterContext } from '../persistence/canonical/game/checkpoint';
import { knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import type { GameView } from '../services/game/GameView';

export function exploreView(): GameView {
  const checkpoint = knowledgeFixture().checkpoint();
  return { id: 'canonical-game', checkpoint, observation: null, autoThrottleMs: 500, randomBattles: false,
    snapshot: { generation: 'generation', gameId: 'canonical-game', revision: 1,
      roots: { knowledge: null, world: null, execution: null }, checkpoint: checkpointJson(checkpoint) },
    ...rosterContext(checkpoint), mode: checkpoint.mode, party: [], inventory: createInitialInventory(), stash: createInitialStash(), quests: [], contracts: [] };
}
