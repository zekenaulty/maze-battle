import { describe, expect, it } from 'vitest';
import { compareAutoTargets, QUEST_PRIORITY, travelCareChoices } from './autoPolicy';
import { inventoryGame, supply } from '../items/__tests__/fixtures';

describe('shared Auto policy', () => {
  it('preserves objective weights, distance cost and deterministic ties', () => {
    expect(QUEST_PRIORITY).toEqual({ fetch: 1000, kill: 900, scout: 800, locate: 700 });
    const targets = [{ id: 'b', priority: 500, distance: 2 }, { id: 'a', priority: 500, distance: 2 },
      { id: 'fetch', priority: 1000, distance: 20 }, { id: 'far', priority: 1000, distance: 100 }];
    expect(targets.sort(compareAutoTargets).map(t => t.id)).toEqual(['fetch', 'a', 'b', 'far']);
  });
  it('selects real care before portal and never chooses locked supplies', () => {
    const game = inventoryGame([supply('health-herb'), supply('mana-vial'), supply('town-portal')], { mode: 'auto-play' });
    game.party[0].hp = 1; game.party[1].hp = 0;
    expect(travelCareChoices(game).map(c => c.kind)).toEqual(['camp', 'use', 'camp', 'portal']);
    game.inventory.items[0].locked = true;
    expect(travelCareChoices(game).map(c => c.kind)).toEqual(['camp', 'camp', 'portal']);
    game.inventory.items.find(i => i.consumableEffect === 'townPortal')!.locked = true;
    expect(travelCareChoices(game).at(-1)).toMatchObject({ kind: 'block', reason: expect.stringContaining('No usable portal') });
  });
});
