import type { ActorState, EquipmentSlot, GameState, ItemInstance } from '../types';
import { clampActorVitals, EQUIPMENT_SLOTS, isEquipmentItem, omitSlot } from './equipment';
import { getItemGearScore } from './gearScore';

export function autoEquipBestGear(game: GameState): GameState {
  const items = game.mode === 'town' ? [...game.inventory.items, ...game.stash.items] : game.inventory.items;
  const party = game.party.map((actor) => ({ ...actor, equipment: { ...actor.equipment } }));
  for (const slot of EQUIPMENT_SLOTS) {
    const assignments = bestSlotAssignments(party, items.filter((item) => item.slot === slot), slot);
    party.forEach((actor, index) => {
      const id = assignments[index];
      actor.equipment = id ? { ...actor.equipment, [slot]: id } : omitSlot(actor.equipment, slot);
    });
  }
  const changes = party.reduce((total, actor, index) => total + EQUIPMENT_SLOTS.filter(
    (slot) => actor.equipment[slot] !== game.party[index].equipment[slot],
  ).length, 0);
  const equippedIds = new Set(party.flatMap((actor) => Object.values(actor.equipment)));
  const withdrawn = game.mode === 'town' ? game.stash.items.filter((item) => isEquipmentItem(item) && equippedIds.has(item.id)) : [];
  if (changes === 0 && withdrawn.length === 0) return game;
  // An overfull legacy pack must not prevent equipping the upgrades that unblock cleanup.
  const inventory = withdrawn.length ? { ...game.inventory, items: [...game.inventory.items, ...withdrawn] } : game.inventory;
  const withdrawnItems = new Set(withdrawn);
  return {
    ...game,
    inventory,
    stash: withdrawn.length ? { ...game.stash, items: game.stash.items.filter((item) => !withdrawnItems.has(item)) } : game.stash,
    party: party.map((actor) => clampActorVitals(actor, inventory)),
    activityLog: [`Auto equipped ${changes} upgrade${changes === 1 ? '' : 's'}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

function bestSlotAssignments(party: ActorState[], items: ItemInstance[], slot: EquipmentSlot) {
  const current = party.map((actor) => items.find((item) => item.id === actor.equipment[slot]));
  const options = party.map((actor, index) => {
    const equipped = current[index];
    if (equipped && (equipped.locked || !isEquipmentItem(equipped))) return [equipped];
    const baseline = equipped ? getItemGearScore(equipped, actor) : 0;
    const candidates = items.filter((item) => isEquipmentItem(item) && !item.locked && getItemGearScore(item, actor) >= baseline && getItemGearScore(item, actor) > 0)
      .sort((a, b) => getItemGearScore(b, actor) - getItemGearScore(a, actor) || a.id.localeCompare(b.id));
    // With N heroes, at most N-1 of a hero's best N choices can be occupied.
    const best = candidates.slice(0, party.length);
    if (equipped && !best.includes(equipped)) best.push(equipped);
    return equipped ? best : [...best, undefined];
  });
  let best = current.map((item) => item?.id);
  let bestScore = current.reduce((total, item, index) => total + (item ? getItemGearScore(item, party[index]) : 0), 0);
  let bestChanges = 0;
  const assignments: Array<string | undefined> = [];
  const used = new Set<string>();
  function walk(index: number, score: number, changes: number) {
    if (index === party.length) {
      if (score > bestScore || (score === bestScore && changes < bestChanges)) {
        best = [...assignments];
        bestScore = score;
        bestChanges = changes;
      }
      return;
    }
    for (const item of options[index]) {
      if (item && used.has(item.id)) continue;
      if (item) used.add(item.id);
      assignments[index] = item?.id;
      walk(index + 1, score + (item ? getItemGearScore(item, party[index]) : 0), changes + Number(item?.id !== current[index]?.id));
      if (item) used.delete(item.id);
    }
  }
  walk(0, 0, 0);
  return best;
}
