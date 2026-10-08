import type { ItemInstance } from '../domain/types';
import { getItemBreakdownLines, getItemStatLines } from '../domain/items/itemDetails';
import type { ItemComparison } from '../viewModels/inventoryComparison';
import { signed } from '../viewModels/characterSheet';

interface ItemDetailsProps {
  item: ItemInstance;
  compact?: boolean;
  comparison?: ItemComparison;
}

export function ItemDetails({ item, compact = false, comparison }: ItemDetailsProps) {
  const statLines = getItemStatLines(item);
  const breakdownLines = compact ? [] : getItemBreakdownLines(item);

  if (statLines.length === 0 && breakdownLines.length === 0 && !comparison) {
    return null;
  }

  return (
    <div className={`item-details ${compact ? 'is-compact' : ''}`}>
      {statLines.length > 0 ? (
        <ul className="item-stat-list" aria-label="Item bonuses">
          {statLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {breakdownLines.length > 0 ? (
        <ul className="item-effect-list" aria-label="Item effects">
          {breakdownLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {comparison && !comparison.isCurrent && <div className="item-comparison" aria-label={`Comparison for ${comparison.actorName}`}>
        <span>For {comparison.actorName} vs {comparison.currentName}: <b>Approx. GS {signed(comparison.scoreDelta)}</b></span>
        {comparison.deltas.length > 0 ? <ul aria-label="Effective stat changes">{comparison.deltas.map(({ key, label, value }) => <li key={key} className={value > 0 ? 'stat-positive' : 'stat-negative'}>{signed(value)} {label}</li>)}</ul> : <small>No effective stat change</small>}
      </div>}
    </div>
  );
}
