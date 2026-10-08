import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { GameState, ItemInstance } from '../../domain/types';
import { getSellValue, isItemEquipped, junkItemsForSale } from '../../domain/items/inventory';
import { itemSummary } from '../../domain/items/catalog';
import { ItemDetails } from '../ItemDetails';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { canReceiveTownItem } from './townCapacity';

interface TownStorageProps {
  game: GameState;
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
  const saleValue = junk.reduce((sum, item) => sum + getSellValue(item) * Math.max(1, item.quantity ?? 1), 0);
  const items = (source === 'stash' ? game.stash.items : game.inventory.items).filter((item) => item.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  function unavailable(item: ItemInstance) {
    if (source === 'pack' && isItemEquipped(game, item.id)) return 'Equipped';
    if (source === 'pack' && !onStashItem) return 'Deposit unavailable';
    return canReceiveTownItem(source === 'stash' ? game.inventory : game.stash, item) ? '' : source === 'stash' ? 'Pack full' : 'Stash full';
  }
  return (
    <section className="town-card town-storage">
      <h2>{String.fromCodePoint(0x1f9f0)} Guild Storage</h2>
      <div className="town-storage-tools">
        <div role="group" aria-label="Storage source">
          <button type="button" aria-pressed={source === 'stash'} onClick={() => setSource('stash')}>Stash {game.stash.items.length}/{game.stash.capacity}</button>
          <button type="button" aria-pressed={source === 'pack'} onClick={() => setSource('pack')}>Pack {game.inventory.items.length}/{game.inventory.capacity}</button>
        </div>
        <input type="search" aria-label="Search storage" placeholder="Search items" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <button type="button" disabled={junk.length === 0} onClick={() => setConfirmSale(true)}>Sell Junk ({junk.length}) - {saleValue}g</button>
      </div>
      <div className="town-storage-list">
        {items.map((item) => {
          const reason = unavailable(item);
          return <article className="town-stock-row" key={item.id}>
            <div><strong>{itemSummary(item)}{item.locked ? ' (Locked)' : ''}</strong><ItemDetails item={item} compact /></div>
            <div className="town-storage-actions">
              {source === 'pack' && onToggleItemLock && <button type="button" title={item.locked ? 'Unlock item' : 'Lock item'} aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.displayName}`} onClick={() => onToggleItemLock(item.id)}>{item.locked ? <Lock size={16} /> : <Unlock size={16} />}</button>}
              <button type="button" disabled={Boolean(reason)} title={reason || undefined} onClick={() => source === 'stash' ? onWithdrawStash(item.id) : onStashItem?.(item.id)}>{reason || (source === 'stash' ? 'Withdraw' : 'Deposit')}</button>
            </div>
          </article>;
        })}
        {items.length === 0 && <p className="empty-state">{query ? 'No matching items.' : source === 'stash' ? 'No items stored.' : 'The pack is empty.'}</p>}
      </div>
      {confirmSale && <ConfirmActionDialog title="Sell junk?" message={`Sell ${junk.length} items for ${saleValue}g: ${junk.map((item) => item.displayName).join(', ')}. This cannot be undone.`} confirmLabel="Sell junk" onConfirm={onSellJunk} onClose={() => setConfirmSale(false)} />}
    </section>
  );
}
