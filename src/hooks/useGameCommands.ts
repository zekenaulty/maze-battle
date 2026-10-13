import { useMemo, useRef } from 'react';
import type { Direction, EquipmentSlot, InventoryPolicy, SkillId, VendorId } from '../domain/types';
import type { SpendableAttribute } from '../domain/party/partyRules';
import { CAMP_SKILLS, type CampSkill } from '../domain/party/campSkills';
import type { CanonicalReceipt, Json } from '../persistence/canonical/types';
import { disableManualAuto, manualScope, sameManualScope, type CanonicalController } from './canonicalManual';

export function useGameCommands(controller: CanonicalController, pauseManual: () => void) {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return useMemo(() => {
    const run = async (kind: Parameters<CanonicalController['execute']>[0], input: Json | (() => Json), stopAuto = true): Promise<CanonicalReceipt> => {
      const captured = typeof input === 'function' ? input : structuredClone(input), scope = manualScope(controller);
      pauseManual();
      // Queue whole intents, including Auto shutdown, not just their individual writes.
      const action = queue.current.then(async () => {
        if (!sameManualScope(controller, scope)) throw new Error('Manual input cancelled.');
        if (stopAuto) await disableManualAuto(controller);
        if (!sameManualScope(controller, scope)) throw new Error('Manual input cancelled.');
        return controller.execute(kind, typeof captured === 'function' ? captured() : captured);
      });
      queue.current = action.catch(() => {});
      return action;
    };
    const camp = (actorId: string, skillId: CampSkill) => run('roster', { kind: 'camp', actorId, skillId });
    return {
      move: (direction: Direction, options: { triggerStairs?: boolean } = {}) =>
        run('exploration', { kind: 'move', direction, triggerStairs: options.triggerStairs !== false }),
      stairs: (direction: 'up' | 'down') => run('exploration', { kind: 'stairs', direction }),
      look: () => run('exploration', { kind: 'look' }),
      openChest: (chestId: string) => run('content', { kind: 'open-chest', chestId }),
      acceptQuest: (contractId: string) => run('content', { kind: 'accept-quest', contractId }),
      claimQuest: (questId: string) => run('content', { kind: 'claim-quest', questId }),
      toggleAuto: () => run('settings', () => ({ kind: 'auto', enabled: controller.view.game!.mode !== 'auto-play' }), false),
      stopAuto: () => run('settings', { kind: 'auto', enabled: false }, false),
      throttle: (ms: number) => run('settings', { kind: 'throttle', ms }),
      actorAuto: (actorId: string, enabled: boolean) => run('roster', { kind: 'actor-auto', actorId, enabled }),
      camp,
      skill: (actorId: string, skillId: SkillId) => CAMP_SKILLS.some(skill => skill === skillId)
        ? run('roster', { kind: 'camp', actorId, skillId }) : Promise.reject(new Error('Only Heal, Group Heal and Resurrect are available outside combat.')),
      portal: () => run('roster', { kind: 'portal' }),
      leaveTown: () => run('roster', { kind: 'leave-town' }),
      rest: () => run('roster', { kind: 'rest' }),
      buy: (vendor: VendorId, baseId: string) => run('roster', { kind: 'buy', vendor, baseId }),
      equip: (actorId: string, itemId: string) => run('roster', { kind: 'equip', actorId, itemId }),
      unequip: (actorId: string, slot: EquipmentSlot) => run('roster', { kind: 'unequip', actorId, slot }),
      useItem: (itemId: string, actorId?: string) => run('roster', { kind: 'use', itemId, ...(actorId === undefined ? {} : { actorId }) }),
      sell: (itemId: string, amount = 1) => run('roster', { kind: 'sell', itemId, amount }),
      sellJunk: () => run('roster', { kind: 'sell-junk' }),
      stash: (itemId: string) => run('roster', { kind: 'stash', itemId }),
      withdraw: (itemId: string) => run('roster', { kind: 'withdraw', itemId }),
      autoEquip: () => run('roster', { kind: 'auto-equip' }),
      policy: (patch: Partial<InventoryPolicy>) => run('roster', { kind: 'policy', patch }),
      lock: (itemId: string) => run('roster', { kind: 'lock', itemId }),
      spend: (actorId: string, attribute: SpendableAttribute) => run('roster', { kind: 'spend-attribute', actorId, attribute }),
      autoSpend: (actorId: string, enabled: boolean) => run('roster', { kind: 'auto-spend', actorId, enabled }),
    };
  }, [controller, pauseManual]);
}
