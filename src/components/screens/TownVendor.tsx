import { useMemo } from 'react';
import type { GameState, VendorId } from '../../domain/types';
import { vendorStock } from '../../domain/town/town';
import { createVendorItem } from '../../domain/items/loot';
import { ItemDetails } from '../ItemDetails';
import { canReceiveTownItem } from './townCapacity';

export function TownVendor({ vendor, title, game, onBuy }: {
  vendor: VendorId; title: string; game: GameState; onBuy: (vendor: VendorId, baseId: string) => void;
}) {
  const stock = useMemo(() => vendorStock(vendor, game.dungeonLevel).map((base) => ({ base, item: createVendorItem(base.id, base.slot ? game.dungeonLevel : 1) })), [vendor, game.dungeonLevel]);
  return (
    <section className="town-card vendor-card">
      <h2>{title}</h2>
      <div className="town-stock-list">
        {stock.map(({ base, item }) => {
          const reason = !Number.isFinite(game.inventory.gold) || game.inventory.gold < base.value ? 'Not enough gold' : !canReceiveTownItem(game, item) ? 'Pack full' : '';
          return <article className="town-stock-row" key={base.id}>
            <div><strong>{base.token} {base.displayName}</strong><ItemDetails item={item} compact /></div>
            <div className="town-stock-action"><button type="button" disabled={Boolean(reason)} title={reason || `Buy ${base.displayName}`} onClick={() => onBuy(vendor, base.id)}>Buy {base.value}g</button>{reason && <small>{reason}</small>}</div>
          </article>;
        })}
      </div>
    </section>
  );
}
