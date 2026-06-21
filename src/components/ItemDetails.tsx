import type { ItemInstance } from '../domain/types';
import { getItemBreakdownLines, getItemStatLines } from '../domain/items/itemDetails';

interface ItemDetailsProps {
  item: ItemInstance;
  compact?: boolean;
}

export function ItemDetails({ item, compact = false }: ItemDetailsProps) {
  const statLines = getItemStatLines(item);
  const breakdownLines = compact ? [] : getItemBreakdownLines(item);

  if (statLines.length === 0 && breakdownLines.length === 0) {
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
    </div>
  );
}
