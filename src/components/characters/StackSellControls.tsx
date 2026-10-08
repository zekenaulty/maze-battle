import { useId, useState } from 'react';
import { Coins } from 'lucide-react';
import type { ItemInstance } from '../../domain/types';
import { itemQuantity } from '../../domain/items/itemStacks';
import { saleDisabledReason } from '../../viewModels/inventorySales';
import './stackSellControls.css';

interface StackSellControlsProps {
  item: ItemInstance;
  getTotal: (amount: number) => number;
  onSell: (itemId: string, amount?: number) => void;
  disabledReason?: string;
}

export function StackSellControls({ item, getTotal, onSell, disabledReason }: StackSellControlsProps) {
  const [selection, setSelection] = useState({ id: item.id, amount: 1 });
  const id = useId();
  const quantity = itemQuantity(item);
  const amount = Math.max(1, Math.min(quantity, selection.id === item.id ? selection.amount : 1));
  const protection = disabledReason ?? saleDisabledReason(item);
  const onePrice = protection ? undefined : getTotal(1);
  const allPrice = protection ? undefined : getTotal(quantity);
  const selectedPrice = protection ? undefined : getTotal(amount);
  const validPrice = (price: number | undefined) => price !== undefined && Number.isSafeInteger(price) && price > 0;
  const reason = protection ?? ([onePrice, allPrice, selectedPrice].every(validPrice) ? undefined : 'Invalid sale value');
  const priceLabel = (price: number | undefined) => validPrice(price) ? `${price}g` : '';
  const sell = (count: number) => {
    if (!reason && Number.isSafeInteger(count) && count >= 1 && count <= quantity) onSell(item.id, count);
  };
  const shared = { type: 'button' as const, disabled: Boolean(reason), 'aria-describedby': reason ? `${id}-reason` : undefined };

  return <div className="stack-sell-controls" role="group" aria-label={`Sell ${item.displayName}`}>
    <div className="stack-sell-buttons">
      <button {...shared} onClick={() => sell(1)}><Coins aria-hidden="true" />Sell One <span>{priceLabel(onePrice)}</span></button>
      {quantity > 1 && <button {...shared} onClick={() => sell(quantity)}><Coins aria-hidden="true" />Sell All ({quantity}) <span>{priceLabel(allPrice)}</span></button>}
    </div>
    {quantity > 1 && <div className="stack-sell-selection">
      <label htmlFor={id}>Quantity <output htmlFor={id}>{amount}/{quantity}</output></label>
      <div>
        <input id={id} type="range" min={1} max={quantity} step={1} value={amount} disabled={Boolean(reason)} aria-label={`Sell quantity for ${item.displayName}`} aria-describedby={reason ? `${id}-reason` : undefined} onChange={(event) => setSelection({ id: item.id, amount: Number(event.currentTarget.value) })} />
        <button {...shared} onClick={() => sell(amount)}><Coins aria-hidden="true" />Sell {amount} <span>{priceLabel(selectedPrice)}</span></button>
      </div>
    </div>}
    {reason && <span id={`${id}-reason`} className="stack-sell-reason">{reason}</span>}
  </div>;
}
