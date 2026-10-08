import type { ActorState, ItemInstance } from '../types';
import { isEquipmentItem } from './equipment';
import { getLoadoutMetrics, type GearMetrics } from './gearMetrics';
import { duplicateItemIds } from './itemOwnership';
import { itemQuantity } from './itemStacks';

export { getLoadoutMetrics } from './gearMetrics';
export type { GearMetrics } from './gearMetrics';

export const BALANCED_GEAR_POLICY = Object.freeze({
  offenseWeight: 0.55, hpWeight: 0.35, manaWeight: 0.10,
  maxOffenseLoss: 0.10, maxHpLoss: 0.20, maxManaLoss: 0.25,
  minHpGainForOffenseLoss: 0.05, hpGainPerOffenseLoss: 3,
  minOffenseGainForHpLoss: 0.05, offenseGainPerHpLoss: 1.5,
  minCombatGainForManaLoss: 0.05,
  mixedBenefitMargin: 0.01,
});
export type GearEvaluationPolicy = { [K in keyof typeof BALANCED_GEAR_POLICY]: number };
export type GearDecision = 'upgrade' | 'equivalent' | 'obsolete' | 'protected';
export type GearReason = 'invalid-loadout' | 'ambiguous-identity' | 'ineligible-item'
  | 'offense-loss-limit' | 'hp-loss-limit' | 'mana-loss-limit' | 'insufficient-hp-compensation'
  | 'insufficient-offense-compensation' | 'insufficient-mana-compensation' | 'insufficient-benefit'
  | 'nonregressing-improvement' | 'balanced-tradeoff' | 'equivalent' | 'no-improvement';
export interface GearEvaluation {
  decision: GearDecision;
  reasons: GearReason[];
  before: GearMetrics;
  after: GearMetrics;
  deltas: GearMetrics;
  relative: GearMetrics;
  benefit: number;
}

const EPSILON = 1e-9;
const KEYS = ['offense', 'hp', 'mana'] as const;

/** Full-loadout comparisons are authoritative; display gear scores and rarity are not inputs. */
export function evaluateLoadoutChange(beforeActor: ActorState, afterActor: ActorState, items: ItemInstance[], policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GearEvaluation {
  const before = getLoadoutMetrics(beforeActor, items);
  const after = getLoadoutMetrics(afterActor, items);
  const deltas = { offense: after.offense - before.offense, hp: after.hp - before.hp, mana: after.mana - before.mana };
  const relative = { offense: deltas.offense / Math.max(1, before.offense), hp: deltas.hp / Math.max(1, before.hp), mana: deltas.mana / Math.max(1, before.mana) };
  // Log ratios form a monotonic utility, so individually beneficial swaps cannot cycle.
  const benefit = KEYS.reduce((sum, key) => sum + policy[`${key}Weight`] * Math.log((1 + after[key]) / (1 + before[key])), 0);
  const result = (decision: GearDecision, ...reasons: GearReason[]): GearEvaluation => ({ decision, reasons, before, after, deltas, relative, benefit });
  if (![...Object.values(before), ...Object.values(after), ...Object.values(policy), benefit].every(Number.isFinite)
    || KEYS.some((key) => before[key] < 0 || after[key] < 0)) return result('protected', 'invalid-loadout');
  if (KEYS.every((key) => Math.abs(deltas[key]) <= EPSILON)) return result('equivalent', 'equivalent');
  if (KEYS.every((key) => deltas[key] >= -EPSILON)) return result('upgrade', 'nonregressing-improvement');
  if (KEYS.every((key) => deltas[key] <= EPSILON)) return result('obsolete', 'no-improvement');
  const reasons: GearReason[] = [];
  if (relative.offense < -policy.maxOffenseLoss - EPSILON) reasons.push('offense-loss-limit');
  if (relative.hp < -policy.maxHpLoss - EPSILON) reasons.push('hp-loss-limit');
  if (relative.mana < -policy.maxManaLoss - EPSILON) reasons.push('mana-loss-limit');
  if (relative.offense < -EPSILON && relative.hp + EPSILON < Math.max(policy.minHpGainForOffenseLoss, -relative.offense * policy.hpGainPerOffenseLoss)) reasons.push('insufficient-hp-compensation');
  if (relative.hp < -EPSILON && relative.offense + EPSILON < Math.max(policy.minOffenseGainForHpLoss, -relative.hp * policy.offenseGainPerHpLoss)) reasons.push('insufficient-offense-compensation');
  if (relative.mana < -EPSILON && Math.max(relative.offense, relative.hp) + EPSILON < policy.minCombatGainForManaLoss) reasons.push('insufficient-mana-compensation');
  if (benefit <= policy.mixedBenefitMargin + EPSILON) reasons.push('insufficient-benefit');
  return reasons.length ? result('obsolete', ...reasons) : result('upgrade', 'balanced-tradeoff');
}

export function evaluateGearUpgrade(actor: ActorState, item: ItemInstance, items: ItemInstance[], policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GearEvaluation {
  const baseline = evaluateLoadoutChange(actor, actor, items, policy);
  const protectedResult = (reason: GearReason): GearEvaluation => ({ ...baseline, decision: 'protected', reasons: [reason] });
  if (!isEquipmentItem(item) || item.locked || itemQuantity(item) === 0) return protectedResult('ineligible-item');
  const ambiguous = duplicateItemIds(items);
  if (ambiguous.has(item.id) || ambiguous.has(actor.equipment[item.slot!] ?? '')) return protectedResult('ambiguous-identity');
  if (!items.some((owned) => owned.id === item.id)) return protectedResult('ineligible-item');
  return evaluateLoadoutChange(actor, { ...actor, equipment: { ...actor.equipment, [item.slot!]: item.id } }, items, policy);
}

/** Unknown data is conserved; rejected mixed tradeoffs are not permanent stash residents. */
export function retainGearForParty(party: ActorState[], item: ItemInstance, items: ItemInstance[], policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): boolean {
  return party.length === 0 || party.some((actor) => {
    const evaluation = evaluateGearUpgrade(actor, item, items, policy);
    return evaluation.decision === 'upgrade' || evaluation.decision === 'protected';
  });
}
