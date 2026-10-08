import { useState } from 'react';
import { RotateCcw, Search, WandSparkles } from 'lucide-react';
import type { ActorState, EquipmentSlot } from '../../domain/types';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from '../../viewModels/inventoryView';
import type { CharactersDialogProps } from '../CharactersDialog';
import { InventoryFilters } from './InventoryFilters';
import { InventoryItem } from './InventoryItem';
import { InventoryPolicyControls } from './InventoryPolicyControls';

export type InventoryActions = Pick<CharactersDialogProps, 'onEquipItem' | 'onUseItem' | 'onSellItem' | 'onStashItem' | 'canSellItems' | 'canStashItems' | 'canUseTownPortal' | 'onToggleItemLock'>;
type InventoryPanelProps = InventoryActions & Pick<CharactersDialogProps, 'party' | 'inventory' | 'onAutoEquip' | 'inventoryPolicy' | 'onInventoryPolicyChange'> & {
  selectedActor: ActorState;
  slotFilter: EquipmentSlot | 'all';
  onSlotFilterChange: (slot: EquipmentSlot | 'all') => void;
};

export function InventoryPanel(props: InventoryPanelProps) {
  const { inventory, party, selectedActor, slotFilter, onSlotFilterChange } = props;
  const [filters, setFilters] = useState(DEFAULT_INVENTORY_FILTERS);
  const activeFilters = { ...filters, slot: slotFilter };
  const rows = projectInventory(inventory, party, selectedActor, activeFilters);
  const reset = () => { setFilters(DEFAULT_INVENTORY_FILTERS); onSlotFilterChange('all'); };

  return <section className="inventory-panel">
    <header>
      <h3>Inventory</h3>
      <span>Gold {inventory.gold} - Pack {inventory.items.length}/{inventory.capacity} - Target {selectedActor.displayName}</span>
      <button type="button" disabled={!inventory.items.some((item) => item.slot)} onClick={props.onAutoEquip}><WandSparkles aria-hidden="true" />Auto Equip</button>
    </header>
    <div className="inventory-search-row">
      <label className="inventory-search"><Search aria-hidden="true" /><input type="search" aria-label="Search inventory" placeholder="Search inventory" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.currentTarget.value })} /></label>
      <button className="character-icon-button" type="button" aria-label="Reset inventory filters" title="Reset inventory filters" onClick={reset}><RotateCcw aria-hidden="true" /></button>
    </div>
    <InventoryFilters filters={activeFilters} onChange={(patch) => { if (patch.slot !== undefined) onSlotFilterChange(patch.slot); setFilters({ ...filters, ...patch }); }} />
    {props.inventoryPolicy && <InventoryPolicyControls policy={props.inventoryPolicy} onChange={props.onInventoryPolicyChange} />}
    <div className="inventory-result-count" role="status">{rows.length} of {inventory.items.length} items</div>
    <div className="inventory-list">
      {rows.map((row) => <InventoryItem key={row.item.id} row={row} {...props} />)}
      {rows.length === 0 && <p className="empty-state">{inventory.items.length === 0 ? 'The pack is empty.' : 'No items match these filters.'}</p>}
    </div>
  </section>;
}
