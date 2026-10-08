import { expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { inventoryDiagnostics } from './inventoryDiagnostics';

it('reports retained invalid ownership and capacity without changing inventory', () => {
  const game = createNewGameState();
  game.inventory.capacity = 1;
  game.stash.items = [{ ...game.inventory.items[0] }, { ...game.inventory.items[1], id: 'bad-quantity', quantity: -1 }];
  game.party[0].equipment.weapon = 'missing';
  const before = JSON.stringify(game);
  const report = inventoryDiagnostics(game);
  expect(report.pack).toEqual({ used: 3, capacity: 1 });
  expect(report.ambiguousIds).toEqual([game.inventory.items[0].id]);
  expect(report.invalidQuantityIds).toEqual(['bad-quantity']);
  expect(report.missingEquipment).toEqual([{ actorId: game.party[0].id, slot: 'weapon', itemId: 'missing' }]);
  expect(JSON.stringify(game)).toBe(before);
});
