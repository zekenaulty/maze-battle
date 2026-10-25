import type { InventoryPolicy } from '../../domain/types';
import { INVENTORY_RESERVE_BOUNDS } from '../../domain/items/inventoryPolicy';

const TOGGLES = [{ key: 'autoEquip', label: 'Auto equip' }, { key: 'autoSellJunk', label: 'Sell junk in town' }, { key: 'autoStash', label: 'Auto stash' }, { key: 'autoRestock', label: 'Restock in town' }] as const;
const RESERVES = [
  { key: 'healthReserve', label: 'Health reserve' },
  { key: 'manaReserve', label: 'Mana reserve' },
  { key: 'portalReserve', label: 'Portal reserve' },
] as const;

export function InventoryPolicyControls({ policy, onChange }: { policy: InventoryPolicy; onChange?: (patch: Partial<InventoryPolicy>) => void }) {
  return <details className="inventory-policy">
    <summary>Inventory care</summary>
    <fieldset disabled={!onChange}>
      <legend className="character-sr-only">Inventory care policy</legend>
      <div className="inventory-policy-toggles">{TOGGLES.map(({ key, label }) => <label key={key}><input type="checkbox" checked={policy[key]} onChange={(event) => onChange?.({ [key]: event.currentTarget.checked })} />{label}</label>)}</div>
      <div className="inventory-policy-reserves">{RESERVES.map(({ key, label }) => {
        const { min, max } = INVENTORY_RESERVE_BOUNDS[key];
        return <label key={key}>{label}<input type="number" min={min} max={max} step={1} value={policy[key]} onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isSafeInteger(value) && value >= min && value <= max) onChange?.({ [key]: value });
        }} /></label>;
      })}</div>
    </fieldset>
  </details>;
}
