import type { GearDecision, GearEvaluation, GearReason } from '../domain/items/gearEvaluation';
import type { ItemInstance } from '../domain/types';

const DECISIONS: Record<GearDecision, string> = {
  upgrade: 'Recommended', equivalent: 'Equivalent', obsolete: 'Not recommended', protected: 'Protected',
};
const REASONS: Record<GearReason, string> = {
  'invalid-loadout': 'Invalid loadout data',
  'ambiguous-identity': 'Duplicate item identity',
  'ineligible-item': 'Item not eligible',
  'offense-loss-limit': 'Too much offense lost',
  'hp-loss-limit': 'Too much HP lost',
  'mana-loss-limit': 'Too much useful MP lost',
  'insufficient-hp-compensation': 'HP gain too small for offense loss',
  'insufficient-offense-compensation': 'Offense gain too small for HP loss',
  'insufficient-mana-compensation': 'Combat gain too small for MP loss',
  'insufficient-benefit': 'Tradeoff benefit too small',
  'nonregressing-improvement': 'Improves combat without losses',
  'balanced-tradeoff': 'Balanced combat tradeoff',
  equivalent: 'No combat change',
  'no-improvement': 'No combat improvement',
};

export function describeGearEvaluation(evaluation: GearEvaluation, item: ItemInstance) {
  const reasons = evaluation.reasons.map((reason) => reason === 'ineligible-item' && item.locked ? 'Locked item' : REASONS[reason]);
  return { label: DECISIONS[evaluation.decision], reason: reasons[0], detail: reasons.join('; ') };
}

export function combatDelta(value: number) {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value !== 0 && Math.abs(value) < 0.01) return value > 0 ? '+<0.01' : '-<0.01';
  const magnitude = Number(Math.abs(value).toFixed(2));
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${magnitude}`;
}
