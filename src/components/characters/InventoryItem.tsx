import { useId } from 'react';
import { Archive, Coins, FlaskConical, LockKeyhole, Shield, UnlockKeyhole } from 'lucide-react';
import type { ActorState, InventoryState } from '../../domain/types';
import { itemSummary } from '../../domain/items/catalog';
import { getItemTooltip } from '../../domain/items/itemDetails';
import { getEffectiveActor } from '../../domain/items/inventory';
import { consumableDisabledReason } from '../../viewModels/inventoryComparison';
import type { InventoryRow } from '../../viewModels/inventoryView';
import { ItemDetails } from '../ItemDetails';
import type { InventoryActions } from './InventoryPanel';

export function InventoryItem({ row, selectedActor, inventory, onEquipItem, onUseItem, onSellItem, onStashItem, canSellItems, canStashItems, canUseTownPortal = true, onToggleItemLock }: InventoryActions & { row: InventoryRow; selectedActor: ActorState; inventory: InventoryState }) {
  const { item, owner, comparison, sellValue } = row;
  const equippedLabel = owner ? `Equipped: ${owner.actor.displayName} - ${owner.slot}` : undefined;
  const equippedBySelectedActor = owner?.actor.id === selectedActor.id;
  const protectedReason = owner ? 'Unequip before selling or stashing' : item.locked ? 'Unlock before selling or stashing' : undefined;
  const effectiveActor = getEffectiveActor(selectedActor, inventory);
  const useReason = consumableDisabledReason(item, effectiveActor, canUseTownPortal);
  const useReasonId = useId();
  const quantity = item.quantity ?? 1;
  const LockIcon = item.locked ? LockKeyhole : UnlockKeyhole;

  return <article className={`inventory-item rarity-${item.rarity} ${owner ? 'is-equipped' : ''}`} data-item-id={item.id} aria-label={item.displayName} title={getItemTooltip(item, equippedLabel)}>
    <div>
      <div className="inventory-item-title"><strong>{itemSummary(item)}</strong>{owner && <b className="item-equipped-badge">{equippedLabel}</b>}{item.locked && <b className="item-locked-badge">Locked</b>}</div>
      <span className="item-meta">Lv {item.itemLevel} - {item.rarity} - {item.slot ?? item.consumableEffect ?? item.category}{quantity > 1 ? ` - Stack ${quantity}` : ''}{comparison ? ` - Approx. GS ${comparison.score}` : ''}</span>
      <ItemDetails item={item} comparison={comparison} />
    </div>
    <div className="inventory-actions">
      {item.slot && <button type="button" disabled={equippedBySelectedActor} title={owner && !equippedBySelectedActor ? `Move from ${owner.actor.displayName} to ${selectedActor.displayName}` : `Equip on ${selectedActor.displayName}`} onClick={() => onEquipItem(selectedActor.id, item.id)}><Shield aria-hidden="true" />{equippedBySelectedActor ? 'Equipped' : owner ? 'Move' : 'Equip'}</button>}
      {item.consumableEffect && <>
        <button type="button" disabled={Boolean(useReason)} aria-describedby={useReason ? useReasonId : undefined} title={useReason ?? (item.consumableEffect === 'townPortal' ? 'Open town portal' : `Use on ${selectedActor.displayName}`)} onClick={() => onUseItem(item.id, selectedActor.id)}><FlaskConical aria-hidden="true" />Use</button>
        {useReason && <span id={useReasonId}>{useReason}</span>}
      </>}
      {onToggleItemLock && <button className="character-icon-button" type="button" aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} title={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} aria-pressed={Boolean(item.locked)} onClick={() => onToggleItemLock(item.id)}><LockIcon aria-hidden="true" /></button>}
      {canSellItems && onSellItem && <button type="button" disabled={Boolean(protectedReason)} title={protectedReason ?? `Sell one for ${sellValue}g`} onClick={() => onSellItem(item.id)}><Coins aria-hidden="true" />Sell {sellValue}g</button>}
      {canStashItems && onStashItem && <button type="button" disabled={Boolean(protectedReason)} title={protectedReason ?? 'Stash this stack'} onClick={() => onStashItem(item.id)}><Archive aria-hidden="true" />Stash</button>}
    </div>
  </article>;
}
