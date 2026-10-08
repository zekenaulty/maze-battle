import type { ItemInstance } from '../../domain/types';
import type { ItemComparison } from '../../viewModels/inventoryComparison';
import { combatDelta, describeGearEvaluation } from '../../viewModels/inventoryEvaluation';
import { signed } from '../../viewModels/characterSheet';

const METRICS = [
  { key: 'offense', label: 'Offense', title: 'Mean expected damage per learned offensive action; not DPS' },
  { key: 'hp', label: 'Max HP', title: 'Equipment-effective maximum HP' },
  { key: 'mana', label: 'Useful MP', title: 'Equipment-effective maximum MP when a learned skill spends mana' },
] as const;

export function ItemComparisonDetails({ item, comparison }: { item: ItemInstance; comparison: ItemComparison }) {
  if (comparison.isCurrent) return null;
  const { evaluation } = comparison;
  const description = describeGearEvaluation(evaluation, item);
  const available = evaluation.decision !== 'protected';
  return <div className="item-comparison" aria-label={`Comparison for ${comparison.actorName}`} data-gear-decision={evaluation.decision}>
    <span>For {comparison.actorName} vs {comparison.currentName}</span>
    <span title={description.detail}><b className={evaluation.decision === 'upgrade' ? 'stat-positive' : undefined}>{description.label}</b>: {description.reason}</span>
    {available ? <ul aria-label="Combat changes">{METRICS.map(({ key, label, title }) => {
      const value = evaluation.deltas[key];
      return <li key={key} title={title} className={value > 0 ? 'stat-positive' : value < 0 ? 'stat-negative' : undefined}>{combatDelta(value)} {label}</li>;
    })}</ul> : <small>Combat comparison unavailable</small>}
    {available && (comparison.deltas.length > 0 ? <ul aria-label="Effective stat changes">{comparison.deltas.map(({ key, label, value }) => <li key={key} className={value > 0 ? 'stat-positive' : 'stat-negative'}>{signed(value)} {label}</li>)}</ul> : <small>No effective stat change</small>)}
    <small>Approx. GS {signed(comparison.scoreDelta)}</small>
  </div>;
}
