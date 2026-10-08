import type { ActorState, EquipmentSlot, GameState, ItemInstance } from '../types';
import { clampActorVitals, EQUIPMENT_SLOTS, isEquipmentItem, omitSlot } from './equipment';
import { BALANCED_GEAR_POLICY, evaluateGearUpgrade, evaluateLoadoutChange, type GearEvaluationPolicy } from './gearEvaluation';
import { ambiguousEquipmentIds } from './itemOwnership';
import { canApplyPackChange } from './packCapacity';

export const MAX_EQUIPMENT_PASSES = 8;

/** Bounded coordinate assignment, not a combinatorial search across equipment slots. */
export function autoEquipBestGear(game: GameState, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GameState {
  const items = game.mode === 'town' ? [...game.inventory.items, ...game.stash.items] : game.inventory.items;
  const protectedIds = ambiguousEquipmentIds(game);
  const party = game.party.map((actor) => ({ ...actor, equipment: { ...actor.equipment } }));
  for (let pass = 0; pass < MAX_EQUIPMENT_PASSES; pass++) {
    let changed = false;
    for (const slot of EQUIPMENT_SLOTS) {
      const assignments = bestSlotAssignments(game, party, items, slot, protectedIds, policy);
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
  const next = projectEquipment(game, party, protectedIds);
  if (changes === 0 && next.inventory === game.inventory) return game;
  if (!canApplyPackChange(game, next)) return game;
  return {
    ...next,
    party: party.map((actor) => clampActorVitals(actor, next.inventory)),
    activityLog: [`Auto equipped ${changes} upgrade${changes === 1 ? '' : 's'}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

function projectEquipment(game: GameState, party: ActorState[], protectedIds: Set<string>): GameState {
  const equippedIds = new Set(party.flatMap((actor) => Object.values(actor.equipment)));
  const withdrawn = new Set(game.mode === 'town' ? game.stash.items.filter((item) => !protectedIds.has(item.id) && isEquipmentItem(item) && equippedIds.has(item.id)) : []);
  return {
    ...game, party,
    inventory: withdrawn.size ? { ...game.inventory, items: [...game.inventory.items, ...withdrawn] } : game.inventory,
    stash: withdrawn.size ? { ...game.stash, items: game.stash.items.filter((item) => !withdrawn.has(item)) } : game.stash,
  };
}

function bestSlotAssignments(game: GameState, party: ActorState[], items: ItemInstance[], slot: EquipmentSlot, protectedIds: Set<string>, policy: GearEvaluationPolicy) {
  const current = party.map((actor) => actor.equipment[slot]);
  const packIds = new Set(game.inventory.items.map((item) => item.id));
  const options = party.map((actor, index) => {
    const equipped = items.find((item) => item.id === current[index]);
    const unchanged = { id: current[index], benefit: 0 };
    if (current[index] && (!equipped || equipped.locked || !isEquipmentItem(equipped) || protectedIds.has(current[index]!))) return [unchanged];
    const candidates = items.filter((item) => item.slot === slot && typeof item.id === 'string' && item.id.length > 0
      && (item.quantity === undefined || item.quantity === 1) && item.id !== current[index] && !protectedIds.has(item.id)).flatMap((item) => {
      const result = evaluateGearUpgrade(actor, item, items, policy);
      if (result.decision !== 'upgrade' && result.decision !== 'equivalent') return [];
      // Guards cover the complete pass, not just each incremental slot swap.
      const total = evaluateLoadoutChange(game.party[index], { ...actor, equipment: { ...actor.equipment, [slot]: item.id } }, items, policy);
      return total.decision === 'upgrade' || total.decision === 'equivalent' ? [{ id: item.id, benefit: result.benefit }] : [];
    });
    // Stable sort preserves pack/stash input order on ties; random IDs never rank gear.
    candidates.sort((a, b) => b.benefit - a.benefit);
    // Keep N choices per capacity cost: stash admission must not hide a usable pack upgrade.
    const best = [...candidates.filter((item) => packIds.has(item.id)).slice(0, party.length),
      ...candidates.filter((item) => !packIds.has(item.id)).slice(0, party.length)];
    best.sort((a, b) => b.benefit - a.benefit);
    return [unchanged, ...best];
  });
  let best = [...current];
  let bestScore = 0;
  let bestChanges = 0;
  const assignments: Array<string | undefined> = [];
  const used = new Set<string>();
  function walk(index: number, score: number, changes: number) {
    if (index === party.length) {
      if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && changes < bestChanges)) {
        const projectedParty = party.map((actor, i) => ({ ...actor, equipment: assignments[i]
          ? { ...actor.equipment, [slot]: assignments[i] } : omitSlot(actor.equipment, slot) }));
        if (!canApplyPackChange(game, projectEquipment(game, projectedParty, protectedIds))) return;
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
