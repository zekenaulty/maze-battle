import type { ActorState, EquipmentSlot, GameState, ItemInstance } from '../types';
import { clampActorVitals, EQUIPMENT_SLOTS, isEquipmentItem, omitSlot } from './equipment';
import { BALANCED_GEAR_POLICY, evaluateGearUpgrade, evaluateLoadoutChange, type GearEvaluationPolicy } from './gearEvaluation';
import { ambiguousEquipmentIds } from './itemOwnership';

export const MAX_EQUIPMENT_PASSES = 8;

/** Bounded coordinate assignment, not a combinatorial search across equipment slots. */
export function autoEquipBestGear(game: GameState, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GameState {
  const items = game.mode === 'town' ? [...game.inventory.items, ...game.stash.items] : game.inventory.items;
  const protectedIds = ambiguousEquipmentIds(game);
  const party = game.party.map((actor) => ({ ...actor, equipment: { ...actor.equipment } }));
  for (let pass = 0; pass < MAX_EQUIPMENT_PASSES; pass++) {
    let changed = false;
    for (const slot of EQUIPMENT_SLOTS) {
      const assignments = bestSlotAssignments(party, game.party, items, slot, protectedIds, policy);
      party.forEach((actor, index) => {
        const id = assignments[index];
        changed ||= actor.equipment[slot] !== id;
        actor.equipment = id ? { ...actor.equipment, [slot]: id } : omitSlot(actor.equipment, slot);
      });
    }
    if (!changed) break;
  }
  const changes = party.reduce((total, actor, index) => total + EQUIPMENT_SLOTS.filter(
    (slot) => actor.equipment[slot] !== game.party[index].equipment[slot],
  ).length, 0);
  const equippedIds = new Set(party.flatMap((actor) => Object.values(actor.equipment)));
  const withdrawn = game.mode === 'town' ? game.stash.items.filter((item) => !protectedIds.has(item.id) && isEquipmentItem(item) && equippedIds.has(item.id)) : [];
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

function bestSlotAssignments(party: ActorState[], original: ActorState[], items: ItemInstance[], slot: EquipmentSlot, protectedIds: Set<string>, policy: GearEvaluationPolicy) {
  const current = party.map((actor) => actor.equipment[slot]);
  const options = party.map((actor, index) => {
    const equipped = items.find((item) => item.id === current[index]);
    const unchanged = { id: current[index], benefit: 0 };
    if (current[index] && (!equipped || equipped.locked || !isEquipmentItem(equipped) || protectedIds.has(current[index]!))) return [unchanged];
    const candidates = items.filter((item) => item.slot === slot && item.id !== current[index] && !protectedIds.has(item.id)).flatMap((item) => {
      const result = evaluateGearUpgrade(actor, item, items, policy);
      if (result.decision !== 'upgrade' && result.decision !== 'equivalent') return [];
      // Guards cover the complete pass, not just each incremental slot swap.
      const total = evaluateLoadoutChange(original[index], { ...actor, equipment: { ...actor.equipment, [slot]: item.id } }, items, policy);
      return total.decision === 'upgrade' || total.decision === 'equivalent' ? [{ id: item.id, benefit: result.benefit }] : [];
    }).sort((a, b) => b.benefit - a.benefit || a.id.localeCompare(b.id));
    // With N heroes, at most N-1 of a hero's best N choices can be occupied.
    return [unchanged, ...candidates.slice(0, party.length)];
  });
  let best = [...current];
  let bestScore = 0;
  let bestChanges = 0;
  const assignments: Array<string | undefined> = [];
  const used = new Set<string>();
  function walk(index: number, score: number, changes: number) {
    if (index === party.length) {
      if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && changes < bestChanges)) {
        best = [...assignments];
        bestScore = score;
        bestChanges = changes;
      }
      return;
    }
    for (const item of options[index]) {
      // Pre-existing ambiguous references stay pinned; unique gear still gets managed.
      if (item.id && used.has(item.id) && !protectedIds.has(item.id)) continue;
      if (item.id) used.add(item.id);
      assignments[index] = item.id;
      walk(index + 1, score + item.benefit, changes + Number(item.id !== current[index]));
      if (item.id) used.delete(item.id);
    }
  }
  walk(0, 0, 0);
  return best;
}
