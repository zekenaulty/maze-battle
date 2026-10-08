import type { ActorState, EquipmentSlot, GameState, ItemInstance } from '../types';
import { clampActorVitals, EQUIPMENT_SLOTS, omitSlot } from './equipment';
import { getItemGearScore } from './gearScore';

export function autoEquipBestGear(game: GameState): GameState {
  const party = game.party.map((actor) => ({ ...actor, equipment: { ...actor.equipment } }));
  for (const slot of EQUIPMENT_SLOTS) {
    const assignments = bestSlotAssignments(party, game.inventory.items.filter((item) => item.slot === slot), slot);
    party.forEach((actor, index) => {
      const id = assignments[index];
      actor.equipment = id ? { ...actor.equipment, [slot]: id } : omitSlot(actor.equipment, slot);
    });
  }
  const changes = party.reduce((total, actor, index) => total + EQUIPMENT_SLOTS.filter(
    (slot) => actor.equipment[slot] !== game.party[index].equipment[slot],
  ).length, 0);
  if (changes === 0) return game;
  return {
    ...game,
    party: party.map((actor) => clampActorVitals(actor, game.inventory)),
    activityLog: [`Auto equipped ${changes} upgrade${changes === 1 ? '' : 's'}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

function bestSlotAssignments(party: ActorState[], items: ItemInstance[], slot: EquipmentSlot) {
  const current = party.map((actor) => items.find((item) => item.id === actor.equipment[slot]));
  const options = party.map((actor, index) => {
    const equipped = current[index];
    if (equipped?.locked) return [equipped];
    const baseline = equipped ? getItemGearScore(equipped, actor) : 0;
    const candidates = items.filter((item) => !item.locked && getItemGearScore(item, actor) >= baseline && getItemGearScore(item, actor) > 0)
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
