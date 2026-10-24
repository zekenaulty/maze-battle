import type { InventoryPolicy } from '../../domain/types';

export function TownPolicy({ policy, onChange }: { policy: InventoryPolicy; onChange: (policy: InventoryPolicy) => void }) {
  return (
    <section className="town-card town-policy">
      <h2>Town Care</h2>
      {([['autoEquip', 'Auto equip'], ['autoSellJunk', 'Auto sell obsolete gear (pack and stash, all rarities)'], ['autoStash', 'Auto stash'], ['autoRestock', 'Auto restock']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={policy[key]} onChange={(event) => onChange({ ...policy, [key]: event.currentTarget.checked })} />{label}</label>)}
      {([['healthReserve', 'Health reserve', 0, 20], ['manaReserve', 'Mana reserve', 0, 20], ['portalReserve', 'Portal reserve', 1, 5]] as const).map(([key, label, min, max]) =>
        <label key={key}>{label}<input type="number" min={min} max={max} step={1} value={policy[key]} onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isSafeInteger(value) && value >= min && value <= max) onChange({ ...policy, [key]: value });
        }} /></label>)}
    </section>
  );
}
