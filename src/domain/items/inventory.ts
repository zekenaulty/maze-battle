import type { ActorState, EquipmentSlot, GameState, InventoryState, ItemInstance, ItemStats, StashState } from '../types';
import { findBaseItem, itemSummary } from './catalog';
import { getItemGearScore } from './gearScore';
import { addItemStats, getItemTotalStats } from './itemDetails';
import { createItemInstance, createVendorItem } from './loot';

const STARTING_GOLD = 35;
const STARTER_ITEMS = ['health-herb', 'mana-vial', 'town-portal'];
const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];

interface ItemContainer {
  capacity: number;
  items: ItemInstance[];
}

export function createInitialInventory(): InventoryState {
  return {
    capacity: 36,
    gold: STARTING_GOLD,
    items: STARTER_ITEMS.map((baseId) => createItemInstance(baseId, 1, 'common', () => 0.5)),
  };
}

export function createInitialStash(): StashState {
  return {
    capacity: 96,
    items: [],
  };
}

export function normalizeInventory(inventory: Partial<InventoryState> | undefined): InventoryState {
  if (!inventory) {
    return createInitialInventory();
  }

  return {
    capacity: inventory.capacity ?? 36,
    gold: inventory.gold ?? STARTING_GOLD,
    items: stackInventoryItems(inventory.items ?? [], inventory.capacity ?? 36),
  };
}

export function normalizeStash(stash: Partial<StashState> | undefined): StashState {
  return {
    capacity: stash?.capacity ?? 96,
    items: stackInventoryItems(stash?.items ?? [], stash?.capacity ?? 96),
  };
}

export function addItemsToInventory(game: GameState, items: ItemInstance[], source: string): GameState {
  if (items.length === 0) {
    return game;
  }

  const { inventory, accepted, rejected } = mergeInventoryItems(game.inventory, items);
  if (accepted.length === 0) {
    return {
      ...game,
      activityLog: trimLog([`${source}: pack full; ${rejected} item${rejected === 1 ? '' : 's'} left behind.`, ...game.activityLog]),
      updatedAt: new Date().toISOString(),
    };
  }

  const lootNames = accepted.map(itemSummary).join(', ');
  const message = rejected > 0 ? `${source}: ${lootNames}; ${rejected} item${rejected === 1 ? '' : 's'} left behind.` : `${source}: ${lootNames}.`;

  return autoEquipBestGear({
    ...game,
    inventory,
    activityLog: trimLog([message, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  });
}

export function equipItem(game: GameState, actorId: string, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  const actor = game.party.find((candidate) => candidate.id === actorId);

  if (!item?.slot || !actor) {
    return game;
  }

  const slot = item.slot;
  const party = game.party.map((candidate) => {
    const equipment = removeItemFromEquipment(candidate.equipment, itemId);
    if (candidate.id !== actorId) {
      return equipment === candidate.equipment ? candidate : { ...candidate, equipment };
    }

    return {
      ...candidate,
      equipment: {
        ...equipment,
        [slot]: item.id,
      },
    };
  });

  return {
    ...game,
    party,
    activityLog: trimLog([`${actor.displayName} equipped ${item.displayName}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function unequipItem(game: GameState, actorId: string, slot: EquipmentSlot): GameState {
  const actor = game.party.find((candidate) => candidate.id === actorId);
  if (!actor?.equipment[slot]) {
    return game;
  }

  const item = game.inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);

  return {
    ...game,
    party: game.party.map((candidate) => {
      if (candidate.id !== actorId) {
        return candidate;
      }

      return clampActorVitals({ ...candidate, equipment: omitSlot(candidate.equipment, slot) }, game.inventory);
    }),
    activityLog: trimLog([`${actor.displayName} unequipped ${item?.displayName ?? slot}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function useConsumable(game: GameState, itemId: string, actorId?: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item?.consumableEffect) {
    return game;
  }

  if (item.consumableEffect === 'townPortal') {
    return decrementInventoryItem(
      {
        ...game,
        mode: 'town',
        battle: undefined,
        activityLog: trimLog(['Town portal opened.', ...game.activityLog]),
      },
      itemId,
    );
  }

  const actor = game.party.find((candidate) => candidate.id === actorId) ?? game.party.find((candidate) => candidate.hp > 0);
  if (!actor) {
    return game;
  }

  const amount = item.consumableAmount ?? 0;
  const party = game.party.map((candidate) => {
    if (candidate.id !== actor.id) {
      return candidate;
    }

    if (item.consumableEffect === 'mana') {
      return { ...candidate, mp: Math.min(candidate.maxMp, candidate.mp + amount) };
    }

    return { ...candidate, hp: Math.min(candidate.maxHp, candidate.hp + amount) };
  });

  return decrementInventoryItem(
    {
      ...game,
      party,
      activityLog: trimLog([`${actor.displayName} used ${item.displayName}.`, ...game.activityLog]),
    },
    itemId,
  );
}

export function buyVendorItem(game: GameState, baseId: string): GameState {
  const base = findBaseItem(baseId);
  if (!base || game.inventory.gold < base.value) {
    return game;
  }

  const item = createVendorItem(baseId, game.dungeonLevel);
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item]);
  if (accepted.length === 0) {
    return game;
  }

  return autoEquipBestGear({
    ...game,
    inventory: {
      ...inventory,
      gold: game.inventory.gold - base.value,
    },
    activityLog: trimLog([`Bought ${item.displayName}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  });
}

export function sellItem(game: GameState, itemId: string): GameState {
  if (game.mode !== 'town') {
    return game;
  }

  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return game;
  }

  const sellValue = getSellValue(item);
  return decrementInventoryItem(
    {
      ...game,
      inventory: {
        ...game.inventory,
        gold: game.inventory.gold + sellValue,
      },
      activityLog: trimLog([`Sold ${itemSummary(item)} for ${sellValue}g.`, ...game.activityLog]),
    },
    itemId,
  );
}

export function sellJunkItems(game: GameState): GameState {
  if (game.mode !== 'town') {
    return game;
  }

  const junk = junkItemsForSale(game);
  if (junk.length === 0) {
    return game;
  }

  const junkIds = new Set(junk.map((item) => item.id));
  const gold = junk.reduce((total, item) => total + getSellValue(item) * itemQuantity(item), 0);

  return {
    ...game,
    inventory: {
      ...game.inventory,
      gold: game.inventory.gold + gold,
      items: game.inventory.items.filter((item) => !junkIds.has(item.id)),
    },
    activityLog: trimLog([`Sold ${junk.length} junk item${junk.length === 1 ? '' : 's'} for ${gold}g.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function junkItemsForSale(game: GameState) {
  return game.inventory.items.filter((item) => isJunkItem(game, item));
}

export function getSellValue(item: ItemInstance) {
  return Math.max(1, Math.ceil(item.value * 0.5));
}

export function stashItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item || isItemEquipped(game, item.id)) {
    return game;
  }

  const { inventory: stash, accepted } = mergeInventoryItems(game.stash, [item]);
  if (accepted.length === 0) {
    return {
      ...game,
      activityLog: trimLog(['Guild stash is full.', ...game.activityLog]),
      updatedAt: new Date().toISOString(),
    };
  }

  const withoutItem = removeInventoryItem(game, itemId);
  return {
    ...withoutItem,
    stash,
    activityLog: trimLog([`Stashed ${itemSummary(item)}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function withdrawStashItem(game: GameState, itemId: string): GameState {
  const item = game.stash.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return game;
  }

  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item]);
  if (accepted.length === 0) {
    return {
      ...game,
      activityLog: trimLog(['Pack is full.', ...game.activityLog]),
      updatedAt: new Date().toISOString(),
    };
  }

  return autoEquipBestGear({
    ...game,
    inventory,
    stash: {
      ...game.stash,
      items: game.stash.items.filter((candidate) => candidate.id !== item.id),
    },
    activityLog: trimLog([`Withdrew ${itemSummary(item)}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  });
}

export function autoEquipBestGear(game: GameState): GameState {
  const party = optimizePartyEquipment(game.party, game.inventory.items);
  const changes = countEquipmentChanges(game.party, party);

  if (changes === 0) {
    return game;
  }

  return {
    ...game,
    party: party.map((actor) => clampActorVitals(actor, game.inventory)),
    activityLog: trimLog([`Auto equipped ${changes} upgrade${changes === 1 ? '' : 's'}.`, ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function recoverParty(game: GameState): GameState {
  return {
    ...game,
    party: game.party.map((actor) => {
      const effective = getEffectiveActor(actor, game.inventory);
      return { ...actor, hp: effective.maxHp, mp: effective.maxMp };
    }),
    activityLog: trimLog(['The party rested at the inn.', ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function getEquippedItems(actor: ActorState, inventory: InventoryState) {
  const ids = Object.values(actor.equipment);
  return inventory.items.filter((item) => ids.includes(item.id));
}

export function getEffectiveActor(actor: ActorState, inventory: InventoryState): ActorState {
  const bonus = getEquipmentStats(actor, inventory);
  const maxHp = actor.maxHp + (bonus.maxHp ?? 0) + (bonus.vitality ?? 0) * 2;
  const maxMp = actor.maxMp + (bonus.maxMp ?? 0) + (bonus.intellect ?? 0) * 2;

  return {
    ...actor,
    hp: Math.min(actor.hp, maxHp),
    mp: Math.min(actor.mp, maxMp),
    maxHp,
    maxMp,
    attributes: {
      ...actor.attributes,
      strength: actor.attributes.strength + (bonus.strength ?? 0),
      vitality: actor.attributes.vitality + (bonus.vitality ?? 0),
      intellect: actor.attributes.intellect + (bonus.intellect ?? 0),
    },
    combat: {
      ...actor.combat,
      baseDamage: actor.combat.baseDamage + (bonus.baseDamage ?? 0),
    },
  };
}

export function getEquipmentStats(actor: ActorState, inventory: InventoryState): ItemStats {
  return getEquippedItems(actor, inventory).reduce<ItemStats>((stats, item) => addItemStats(stats, getItemTotalStats(item)), {});
}

export function isItemEquipped(game: GameState, itemId: string) {
  return game.party.some((actor) => Object.values(actor.equipment).includes(itemId));
}

function isJunkItem(game: GameState, item: ItemInstance) {
  if (!item.slot || isItemEquipped(game, item.id) || item.rarity === 'legendary' || item.rarity === 'rare') {
    return false;
  }

  return game.party.every((actor) => getItemGearScore(item, actor) <= 0);
}

function optimizePartyEquipment(party: ActorState[], items: ItemInstance[]) {
  const nextParty = party.map((actor) => ({ ...actor, equipment: { ...actor.equipment } }));

  for (const slot of EQUIPMENT_SLOTS) {
    const assignments = bestSlotAssignments(nextParty, items.filter((item) => item.slot === slot), slot);

    nextParty.forEach((actor, index) => {
      const itemId = assignments[index];
      actor.equipment = itemId ? { ...actor.equipment, [slot]: itemId } : omitSlot(actor.equipment, slot);
    });
  }

  return nextParty;
}

function bestSlotAssignments(party: ActorState[], candidates: ItemInstance[], slot: EquipmentSlot) {
  let bestScore = 0;
  let bestAssignments: Array<string | undefined> = Array(party.length).fill(undefined);
  const currentAssignments: Array<string | undefined> = Array(party.length).fill(undefined);
  const used = new Set<string>();

  function walk(actorIndex: number, score: number) {
    if (actorIndex >= party.length) {
      if (score > bestScore) {
        bestScore = score;
        bestAssignments = [...currentAssignments];
      }
      return;
    }

    currentAssignments[actorIndex] = undefined;
    walk(actorIndex + 1, score);

    const actor = party[actorIndex];
    for (const item of candidates) {
      if (used.has(item.id)) {
        continue;
      }

      const itemScore = getItemGearScore(item, actor);
      if (itemScore <= 0) {
        continue;
      }

      used.add(item.id);
      currentAssignments[actorIndex] = item.id;
      const keepEquippedBonus = actor.equipment[slot] === item.id ? 0.01 : 0;
      walk(actorIndex + 1, score + itemScore + keepEquippedBonus);
      used.delete(item.id);
    }
  }

  walk(0, 0);
  return bestAssignments;
}

function countEquipmentChanges(before: ActorState[], after: ActorState[]) {
  return before.reduce((changes, actor, index) => {
    const nextActor = after[index];
    return (
      changes +
      EQUIPMENT_SLOTS.filter((slot) => actor.equipment[slot] !== nextActor.equipment[slot]).length
    );
  }, 0);
}

function mergeInventoryItems<T extends ItemContainer>(inventory: T, incoming: ItemInstance[]) {
  const nextItems = stackInventoryItems(inventory.items, inventory.capacity);
  const accepted: ItemInstance[] = [];
  let rejected = 0;

  for (const item of incoming) {
    const normalized = normalizeInventoryItem(item);
    const existingIndex = isStackableItem(normalized) ? nextItems.findIndex((candidate) => stackKey(candidate) === stackKey(normalized)) : -1;

    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      nextItems[existingIndex] = {
        ...existing,
        quantity: itemQuantity(existing) + itemQuantity(normalized),
      };
      accepted.push(normalized);
      continue;
    }

    if (nextItems.length >= inventory.capacity) {
      rejected += itemQuantity(normalized);
      continue;
    }

    nextItems.push(normalized);
    accepted.push(normalized);
  }

  return {
    inventory: {
      ...inventory,
      items: nextItems,
    } as T,
    accepted,
    rejected,
  };
}

function stackInventoryItems(items: ItemInstance[], capacity: number) {
  return items.reduce<ItemInstance[]>((stacked, item) => {
    const normalized = normalizeInventoryItem(item);
    const existingIndex = isStackableItem(normalized) ? stacked.findIndex((candidate) => stackKey(candidate) === stackKey(normalized)) : -1;

    if (existingIndex >= 0) {
      const existing = stacked[existingIndex];
      stacked[existingIndex] = {
        ...existing,
        quantity: itemQuantity(existing) + itemQuantity(normalized),
      };
      return stacked;
    }

    if (stacked.length >= capacity) {
      return stacked;
    }

    stacked.push(normalized);
    return stacked;
  }, []);
}

function normalizeInventoryItem(item: ItemInstance): ItemInstance {
  if (!isStackableItem(item)) {
    const { quantity: _quantity, ...singleItem } = item;
    return singleItem;
  }

  return {
    ...item,
    quantity: itemQuantity(item),
  };
}

function itemQuantity(item: ItemInstance) {
  return Math.max(1, Math.floor(item.quantity ?? 1));
}

function isStackableItem(item: ItemInstance) {
  return !item.slot && Boolean(item.consumableEffect);
}

function stackKey(item: ItemInstance) {
  return [item.baseId, item.itemLevel, item.rarity, item.value, item.consumableEffect, item.consumableAmount].join('|');
}

function removeItemFromEquipment(equipment: ActorState['equipment'], itemId: string) {
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(equipment).filter(([, equippedId]) => {
      const keep = equippedId !== itemId;
      changed = changed || !keep;
      return keep;
    }),
  );

  return changed ? next : equipment;
}

function omitSlot(equipment: ActorState['equipment'], slot: EquipmentSlot) {
  const { [slot]: _removed, ...next } = equipment;
  return next;
}

function decrementInventoryItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return game;
  }

  if (itemQuantity(item) <= 1) {
    return removeInventoryItem(game, itemId);
  }

  const inventory = {
    ...game.inventory,
    items: game.inventory.items.map((candidate) => (candidate.id === itemId ? { ...candidate, quantity: itemQuantity(candidate) - 1 } : candidate)),
  };

  return {
    ...game,
    inventory,
    updatedAt: new Date().toISOString(),
  };
}

function removeInventoryItem(game: GameState, itemId: string): GameState {
  const inventory = {
    ...game.inventory,
    items: game.inventory.items.filter((item) => item.id !== itemId),
  };

  return {
    ...game,
    inventory,
    party: game.party.map((actor) => clampActorVitals({ ...actor, equipment: removeItemFromEquipment(actor.equipment, itemId) }, inventory)),
    updatedAt: new Date().toISOString(),
  };
}

function clampActorVitals(actor: ActorState, inventory: InventoryState): ActorState {
  const effective = getEffectiveActor(actor, inventory);
  return { ...actor, hp: Math.min(actor.hp, effective.maxHp), mp: Math.min(actor.mp, effective.maxMp) };
}

function trimLog(entries: string[]) {
  return entries.slice(0, 12);
}
