import { useId } from 'react';
import { Archive, FlaskConical, LockKeyhole, Shield, UnlockKeyhole } from 'lucide-react';
import type { ActorState, InventoryState } from '../../domain/types';
import { itemSummary } from '../../domain/items/catalog';
import { getItemTooltip } from '../../domain/items/itemDetails';
import { getEffectiveActor } from '../../domain/items/inventory';
import { consumableDisabledReason } from '../../viewModels/inventoryComparison';
import { getStackSellValue } from '../../viewModels/inventorySales';
import type { InventoryRow } from '../../viewModels/inventoryView';
import { ItemDetails } from '../ItemDetails';
import type { InventoryActions } from './InventoryPanel';
import { StackSellControls } from './StackSellControls';

export function InventoryItem({ row, selectedActor, inventory, onEquipItem, onUseItem, onSellItem, onStashItem, canSellItems, canStashItems, canUseTownPortal = true, onToggleItemLock }: InventoryActions & { row: InventoryRow; selectedActor: ActorState; inventory: InventoryState }) {
  const { item, owner, comparison } = row;
  const equippedLabel = owner ? `Equipped: ${owner.actor.displayName} - ${owner.slot}` : undefined;
  const equippedBySelectedActor = owner?.actor.id === selectedActor.id;
  const effectiveActor = getEffectiveActor(selectedActor, inventory);
  const useReason = consumableDisabledReason(item, effectiveActor, canUseTownPortal);
  const useReasonId = useId();
  const equipReasonId = useId();
  const stashReasonId = useId();
  const equipReason = row.equipDisabledReason;
  const stashReason = row.stashDisabledReason;
  const quantity = item.quantity ?? 1;
  const LockIcon = item.locked ? LockKeyhole : UnlockKeyhole;

  return <article className={`inventory-item rarity-${item.rarity} ${owner ? 'is-equipped' : ''}`} data-item-id={item.id} aria-label={item.displayName} title={getItemTooltip(item, equippedLabel)}>
    <div>
      <div className="inventory-item-title"><strong>{itemSummary(item)}</strong>{owner && <b className="item-equipped-badge">{equippedLabel}</b>}{item.locked && <b className="item-locked-badge">Locked</b>}</div>
      <span className="item-meta">{item.category === 'equipment' && `Lv ${item.itemLevel} - `}{item.rarity} - {item.slot ?? item.consumableEffect ?? item.category}{quantity > 1 ? ` - Stack ${quantity}` : ''}{comparison ? ` - Approx. GS ${comparison.score}` : ''}</span>
      <ItemDetails item={item} comparison={comparison} />
    </div>
    <div className="inventory-actions">
      {item.slot && <>
        <button type="button" disabled={Boolean(equipReason)} aria-describedby={equipReason && equipReason !== 'Already equipped' ? equipReasonId : undefined} title={equipReason ?? (owner && !equippedBySelectedActor ? `Move from ${owner.actor.displayName} to ${selectedActor.displayName}` : `Equip on ${selectedActor.displayName}`)} onClick={() => onEquipItem(selectedActor.id, item.id)}><Shield aria-hidden="true" />{equippedBySelectedActor ? 'Equipped' : owner ? 'Move' : 'Equip'}</button>
        {equipReason && equipReason !== 'Already equipped' && <span id={equipReasonId}>{equipReason}</span>}
      </>}
      {item.consumableEffect && <>
        <button type="button" disabled={Boolean(useReason)} aria-describedby={useReason ? useReasonId : undefined} title={useReason ?? (item.consumableEffect === 'townPortal' ? 'Open town portal' : `Use on ${selectedActor.displayName}`)} onClick={() => onUseItem(item.id, selectedActor.id)}><FlaskConical aria-hidden="true" />Use</button>
        {useReason && <span id={useReasonId}>{useReason}</span>}
      </>}
      {onToggleItemLock && <button className="character-icon-button" type="button" aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} title={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} aria-pressed={Boolean(item.locked)} onClick={() => onToggleItemLock(item.id)}><LockIcon aria-hidden="true" /></button>}
      {canStashItems && onStashItem && <>
        <button type="button" disabled={Boolean(stashReason)} aria-describedby={stashReason ? stashReasonId : undefined} title={stashReason ?? 'Stash this stack'} onClick={() => onStashItem(item.id)}><Archive aria-hidden="true" />Stash</button>
        {stashReason && <span id={stashReasonId}>{stashReason}</span>}
      </>}
      {canSellItems && onSellItem && <StackSellControls item={item} disabledReason={row.saleDisabledReason} getTotal={(amount) => getStackSellValue(item, amount)} onSell={onSellItem} />}
    </div>
  </article>;
}
