import { describe, expect, it } from 'vitest';
import type { GameMode } from '../types';
import { autoEquipBestGear } from './equipmentOptimizer';
import { evaluateGearUpgrade } from './gearEvaluation';
import { gear, inventoryGame } from './__tests__/fixtures';

const ID_ORDERS = [
  ['ffffffff', 'aaaaaaaa', '55555555', '00000000'],
  ['00000000', '55555555', 'aaaaaaaa', 'ffffffff'],
  ['55555555', 'ffffffff', '00000000', 'aaaaaaaa'],
];

function tiedInventory(ids: string[], mode: GameMode) {
  // Distinct primary/durability bonuses produce identical current combat output.
  const items = ids.map((id, index) => ({
    ...gear(`choice-${index}`, index % 2 === 0 ? { strength: 3, maxHp: 20 } : { strength: 4, vitality: 10 }),
    id: `${id}-0000-4000-8000-000000000000`,
  }));
  return inventoryGame(items, { mode, ...(mode === 'town' ? {
    inventory: { capacity: 36, gold: 0, items: items.slice(0, 2) },
    stash: { capacity: 96, items: items.slice(2) },
  } : {}) });
}

describe('ID-independent equipment ties', () => {
  it.each(['manual', 'town'] as const)('uses stable input order through candidate truncation and whole-party assignment in %s', (mode) => {
    for (const ids of ID_ORDERS) {
      const game = tiedInventory(ids, mode);
      const owned = [...game.inventory.items, ...game.stash.items];
      for (const actor of game.party) {
        expect(new Set(owned.map((item) => evaluateGearUpgrade(actor, item, owned).benefit)).size).toBe(1);
      }
      const next = autoEquipBestGear(game);
      const assigned = next.party.map((actor) => owned.find((item) => item.id === actor.equipment.weapon)?.baseId);
      expect(assigned).toEqual(['choice-0', 'choice-1', 'choice-2']);
      expect(autoEquipBestGear(next)).toBe(next);
    }
  });

  it('keeps current choices even when equally beneficial alternatives occur earlier in input', () => {
    for (const ids of ID_ORDERS) {
      const base = tiedInventory(ids, 'manual');
      const current = base.inventory.items.slice(1);
      const game = { ...base, party: base.party.map((actor, index) => ({ ...actor, equipment: { weapon: current[index].id } })) };
      expect(autoEquipBestGear(game)).toBe(game);
    }
  });
});
