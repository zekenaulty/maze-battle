import type { InventoryPolicy } from '../../domain/types';
import { INVENTORY_RESERVE_BOUNDS } from '../../domain/items/inventoryPolicy';

export function TownPolicy({ policy, onChange }: { policy: InventoryPolicy; onChange: (policy: InventoryPolicy) => void }) {
  return (
    <section className="town-card town-policy">
      <h2>Town Care</h2>
      {([['autoEquip', 'Auto equip'], ['autoSellJunk', 'Auto sell obsolete gear (pack and stash, all rarities)'], ['autoStash', 'Auto stash'], ['autoRestock', 'Auto restock']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={policy[key]} onChange={(event) => onChange({ ...policy, [key]: event.currentTarget.checked })} />{label}</label>)}
      {([['healthReserve', 'Health reserve'], ['manaReserve', 'Mana reserve'], ['portalReserve', 'Portal reserve']] as const).map(([key, label]) => {
        const { min, max } = INVENTORY_RESERVE_BOUNDS[key];
        return <label key={key}>{label}<input type="number" min={min} max={max} step={1} value={policy[key]} onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isSafeInteger(value) && value >= min && value <= max) onChange({ ...policy, [key]: value });
        }} /></label>;
      })}
    </section>
  );
}
