import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { ItemInstance } from '../../domain/types';
import type { RosterState } from '../../domain/party/roster';
import { ambiguousItemIds, getSellValue, isItemEquipped, junkItemsForSale, packSlotUsage } from '../../domain/items/inventory';
import { itemQuantity } from '../../domain/items/itemStacks';
import { itemSummary } from '../../domain/items/catalog';
import { ItemDetails } from '../ItemDetails';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { canReceiveTownItem } from './townCapacity';

interface TownStorageProps {
  game: Pick<RosterState, 'party' | 'inventory' | 'stash'>;
  onSellJunk: () => void;
  onWithdrawStash: (itemId: string) => void;
  onStashItem?: (itemId: string) => void;
  onToggleItemLock?: (itemId: string) => void;
}

export function TownStorage({ game, onSellJunk, onWithdrawStash, onStashItem, onToggleItemLock }: TownStorageProps) {
  const [source, setSource] = useState<'stash' | 'pack'>('stash');
  const [query, setQuery] = useState('');
  const [confirmSale, setConfirmSale] = useState(false);
  const junk = junkItemsForSale(game);
  const saleValue = junk.reduce((sum, item) => sum + getSellValue(item, itemQuantity(item)), 0);
  const items = (source === 'stash' ? game.stash.items : game.inventory.items).filter((item) => item.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  const ambiguous = ambiguousItemIds(game);
  function unavailable(item: ItemInstance) {
    if (ambiguous.has(item.id)) return 'Duplicate item identity';
    if (itemQuantity(item) === 0) return 'Invalid stack quantity';
    if (source === 'pack' && isItemEquipped(game, item.id)) return 'Equipped';
    if (source === 'pack' && item.locked) return 'Locked';
    if (source === 'pack' && !onStashItem) return 'Deposit unavailable';
    return canReceiveTownItem(game, item, source === 'stash' ? 'pack' : 'stash') ? '' : source === 'stash' ? 'Pack full' : 'Stash full';
  }
  return (
    <section className="town-card town-storage">
      <h2>{String.fromCodePoint(0x1f9f0)} Guild Storage</h2>
      <div className="town-storage-tools">
        <div role="group" aria-label="Storage source">
          <button type="button" aria-pressed={source === 'stash'} onClick={() => setSource('stash')}>Stash {game.stash.items.length}/{game.stash.capacity}</button>
          <button type="button" aria-pressed={source === 'pack'} onClick={() => setSource('pack')}>Pack {packSlotUsage(game)}/{game.inventory.capacity}</button>
        </div>
        <input type="search" aria-label="Search storage" placeholder="Search items" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <button type="button" disabled={junk.length === 0} title="All rarities. Keeps upgrades, equipped or locked gear, quest items and supplies." onClick={() => setConfirmSale(true)}>Sell obsolete gear ({junk.length}) - {saleValue}g (pack and stash)</button>
      </div>
      <div className="town-storage-list">
        {items.map((item, index) => {
          const reason = unavailable(item);
          return <article className="town-stock-row" key={`${item.id}:${index}`}>
            <div><strong>{itemSummary(item)}{item.locked ? ' (Locked)' : ''}</strong><ItemDetails item={item} compact /></div>
            <div className="town-storage-actions">
              {source === 'pack' && onToggleItemLock && <button type="button" title={item.locked ? 'Unlock item' : 'Lock item'} aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} onClick={() => onToggleItemLock(item.id)}>{item.locked ? <Lock size={16} /> : <Unlock size={16} />}</button>}
              <button type="button" disabled={Boolean(reason)} title={reason || undefined} onClick={() => source === 'stash' ? onWithdrawStash(item.id) : onStashItem?.(item.id)}>{reason || (source === 'stash' ? 'Withdraw' : 'Deposit')}</button>
            </div>
          </article>;
        })}
        {items.length === 0 && <p className="empty-state">{query ? 'No matching items.' : source === 'stash' ? 'No items stored.' : 'The pack is empty.'}</p>}
      </div>
      {confirmSale && <ConfirmActionDialog title="Sell obsolete gear?" message={`Sell ${junk.length} obsolete gear item${junk.length === 1 ? '' : 's'} from pack and stash for ${saleValue}g: ${junk.map((item) => item.displayName).join(', ')}. All rarities are eligible. Upgrades, equipped or locked gear, quest items and supplies are kept. This cannot be undone.`} confirmLabel="Sell obsolete gear" onConfirm={onSellJunk} onClose={() => setConfirmSale(false)} />}
    </section>
  );
}
