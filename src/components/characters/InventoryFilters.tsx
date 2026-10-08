import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { EQUIPMENT_SLOTS } from '../../viewModels/characterSheet';
import type { InventoryFilters as Filters } from '../../viewModels/inventoryView';

export function InventoryFilters({ filters, onChange }: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (filters.slot !== 'all') setExpanded(true); }, [filters.slot]);
  const count = [filters.category, filters.slot, filters.rarity, filters.ownership].filter((value) => value !== 'all').length;
  return <details className="inventory-filter-options" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><SlidersHorizontal aria-hidden="true" />Filters and sort{count > 0 ? ` (${count})` : ''}</summary>
    <div className="inventory-filters">
    <label>Type<select aria-label="Type" value={filters.category} onChange={(event) => onChange({ category: event.currentTarget.value as Filters['category'] })}>
      <option value="all">All types</option><option value="equipment">Equipment</option><option value="consumable">Consumables</option><option value="currency">Currency</option>
    </select></label>
    <label>Slot<select aria-label="Slot" value={filters.slot} onChange={(event) => onChange({ slot: event.currentTarget.value as Filters['slot'] })}>
      <option value="all">All slots</option>{EQUIPMENT_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
    </select></label>
    <label>Rarity<select aria-label="Rarity" value={filters.rarity} onChange={(event) => onChange({ rarity: event.currentTarget.value as Filters['rarity'] })}>
      <option value="all">All rarities</option>{['common', 'magic', 'rare', 'legendary'].map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}
    </select></label>
    <label>Status<select aria-label="Status" value={filters.ownership} onChange={(event) => onChange({ ownership: event.currentTarget.value as Filters['ownership'] })}>
      <option value="all">All items</option><option value="selected">This character</option><option value="equipped">Equipped</option><option value="unequipped">Unequipped</option><option value="locked">Locked</option><option value="upgrades">GS upgrades</option>
    </select></label>
    <label>Sort<select aria-label="Sort" value={filters.sort} onChange={(event) => onChange({ sort: event.currentTarget.value as Filters['sort'] })}>
      <option value="name">Name A-Z</option><option value="score">Gear score</option><option value="upgrade">GS gain</option><option value="value">Sell value</option><option value="level">Item level</option><option value="rarity">Rarity</option>
    </select></label>
    </div>
  </details>;
}
