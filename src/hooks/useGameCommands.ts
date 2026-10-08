import { useMemo } from 'react';
import type { Direction, EquipmentSlot, GameState, InventoryPolicy, SkillId, VendorId } from '../domain/types';
import { setActorAutoBattle, setAutoThrottle, setRandomBattles } from '../domain/gameFactory';
import { advanceBattleRound, endBattle, useBattleSkill } from '../domain/combat/battleEngine';
import { defaultRng } from '../domain/combat/rng';
import { autoEquipBestGear, equipItem, sellItem, sellJunkItems, setInventoryPolicy, stashItem, toggleItemLock, unequipItem, useConsumable, withdrawStashItem } from '../domain/items/inventory';
import { acceptGuildContract, claimGuildQuestReward } from '../domain/quests/quests';
import { buyFromVendor, leaveTown, useInn, useTownPortal } from '../domain/town/town';
import { stopAllAutomation, toggleAutoplay, toggleWaves } from '../domain/automation/autoPlay';
import { castExplorationSkill, setAutoSpendPoints, spendAttribute, type SpendableAttribute } from '../domain/party/partyActions';
import { moveManually, type GameTransition } from './useGameLoop';

export function useGameCommands(transition: GameTransition) {
  return useMemo(() => {
    const run = (action: string, update: (game: GameState) => GameState) => transition(update, { action, source: 'manual' });
    return {
      move: (direction: Direction) => run('move', g => moveManually(g, direction)),
      toggleAuto: () => run('toggle-auto', toggleAutoplay),
      toggleWaves: () => run('toggle-waves', g => toggleWaves(g)),
      stopAuto: () => run('stop-auto', stopAllAutomation),
      throttle: (ms: number) => run('throttle', g => setAutoThrottle(g, ms)),
      encounters: (enabled: boolean) => run('encounters', g => setRandomBattles(g, enabled)),
      actorAuto: (id: string, enabled: boolean) => run('actor-auto', g => ({ ...setActorAutoBattle(g, id, enabled), automationPaused: enabled ? false : g.automationPaused })),
      round: () => run('round', g => advanceBattleRound(g, defaultRng, Date.now())),
      skill: (actorId: string, skillId: SkillId) => run('skill', g => g.battle ? useBattleSkill(g, actorId, skillId) : castExplorationSkill(g, actorId, skillId)),
      closeBattle: () => run('end-battle', g => stopAllAutomation(endBattle(g))),
      portal: () => run('portal', useTownPortal),
      leaveTown: () => run('leave-town', leaveTown),
      rest: () => run('inn', useInn),
      buy: (vendor: VendorId, id: string) => run('buy', g => buyFromVendor(g, vendor, id)),
      acceptQuest: (id: string) => run('accept-quest', g => acceptGuildContract(g, id)),
      claimQuest: (id: string) => run('claim-quest', g => claimGuildQuestReward(g, id)),
      equip: (actorId: string, id: string) => run('equip', g => equipItem(g, actorId, id)),
      unequip: (actorId: string, slot: EquipmentSlot) => run('unequip', g => unequipItem(g, actorId, slot)),
      useItem: (id: string, actorId?: string) => run('use-item', g => useConsumable(g, id, actorId)),
      sell: (id: string, amount = 1) => run('sell', g => sellItem(g, id, amount)),
      sellJunk: () => run('sell-junk', sellJunkItems),
      stash: (id: string) => run('stash', g => stashItem(g, id)),
      withdraw: (id: string) => run('withdraw', g => withdrawStashItem(g, id)),
      autoEquip: () => run('auto-equip', autoEquipBestGear),
      policy: (patch: Partial<InventoryPolicy>) => run('inventory-policy', g => setInventoryPolicy(g, patch)),
      lock: (id: string) => run('lock-item', g => toggleItemLock(g, id)),
      spend: (actorId: string, attribute: SpendableAttribute) => run('spend-attribute', g => spendAttribute(g, actorId, attribute)),
      autoSpend: (actorId: string, enabled: boolean) => run('auto-spend', g => setAutoSpendPoints(g, actorId, enabled)),
    };
  }, [transition]);
}
