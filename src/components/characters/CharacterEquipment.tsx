import { Search, X } from 'lucide-react';
import type { ActorState, EquipmentSlot, InventoryState } from '../../domain/types';
import { itemSummary } from '../../domain/items/catalog';
import { getItemTooltip } from '../../domain/items/itemDetails';
import { EQUIPMENT_SLOTS } from '../../viewModels/characterSheet';
import { ItemDetails } from '../ItemDetails';

export function CharacterEquipment({ actor, inventory, onUnequipItem, onBrowse }: {
  actor: ActorState; inventory: InventoryState; onUnequipItem: (actorId: string, slot: EquipmentSlot) => void; onBrowse: (slot: EquipmentSlot) => void;
}) {
  return <div className="equipment-grid">
    {EQUIPMENT_SLOTS.map((slot) => {
      const item = inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);
      return <div className={`equipment-slot ${item ? `rarity-${item.rarity}` : ''}`} key={slot}>
        <div className="equipment-slot-heading"><span>{slot}</span><button className="character-icon-button" type="button" aria-label={`Browse ${slot}`} title={`Browse ${slot}`} onClick={() => onBrowse(slot)}><Search aria-hidden="true" /></button></div>
        {item ? <>
          <button className="equipment-item-button" type="button" title={`${getItemTooltip(item)}\nUnequip ${item.displayName}`} aria-label={`Unequip ${item.displayName} from ${actor.displayName}`} onClick={() => onUnequipItem(actor.id, slot)}><span className="item-name">{itemSummary(item)}</span><span className="equipment-remove"><X aria-hidden="true" />Unequip</span></button>
          <ItemDetails item={item} compact />
          {item.locked && <b className="item-locked-badge">Locked</b>}
        </> : <em>{actor.equipment[slot] ? 'Item missing from pack' : 'empty'}</em>}
      </div>;
    })}
  </div>;
}
