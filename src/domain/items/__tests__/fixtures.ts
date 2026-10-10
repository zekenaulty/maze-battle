import { createNewGameState } from '../../gameFactory';
import type { GameState, ItemInstance, ItemStats } from '../../types';
import { createItemInstance } from '../loot';

export function inventoryGame(items: ItemInstance[] = [], overrides: Partial<GameState> = {}): GameState {
  const game = createNewGameState({
    maze: {
      rows: 1, columns: 3, start: { row: 0, column: 0 }, end: { row: 0, column: 2 }, active: { row: 0, column: 1 },
      visited: [{ row: 0, column: 0 }, { row: 0, column: 1 }],
      cells: [
        { row: 0, column: 0, links: ['east'] },
        { row: 0, column: 1, links: ['east', 'west'] },
        { row: 0, column: 2, links: ['west'] },
      ],
    },
    chests: [], quests: [], inventory: { capacity: 36, gold: 0, items },
  });
  return { ...game, ...overrides };
}

export function gear(id: string, stats: ItemStats, extra: Partial<ItemInstance> = {}): ItemInstance {
  return { id, baseId: id, displayName: id, token: '!', category: 'equipment', rarity: 'common', itemLevel: 1, value: 10, slot: 'weapon', stats, ...extra };
}

export function supply(baseId: string, quantity = 1, extra: Partial<ItemInstance> = {}): ItemInstance {
  return { ...createItemInstance(baseId, 1, 'common', () => 0.5), quantity, ...extra };
}

export function assignWeapons(game: GameState, ids: string[]): GameState {
  return { ...game, party: game.party.map((actor, index) => ({ ...actor, equipment: ids[index] ? { weapon: ids[index] } : {} })) };
}
