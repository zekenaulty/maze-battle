import type { InventoryPolicy } from '../../domain/types';

export function TownPolicy({ policy, onChange }: { policy: InventoryPolicy; onChange: (policy: InventoryPolicy) => void }) {
  return (
    <section className="town-card town-policy">
      <h2>Town Care</h2>
      {([['autoEquip', 'Auto equip'], ['autoSellJunk', 'Auto sell obsolete gear (pack and stash, all rarities)'], ['autoStash', 'Auto stash'], ['autoRestock', 'Auto restock']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={policy[key]} onChange={(event) => onChange({ ...policy, [key]: event.currentTarget.checked })} />{label}</label>)}
      {([['healthReserve', 'Health reserve'], ['manaReserve', 'Mana reserve'], ['portalReserve', 'Portal reserve']] as const).map(([key, label]) =>
        <label key={key}>{label}<input type="number" min={0} step={1} value={policy[key]} onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value) && value >= 0) onChange({ ...policy, [key]: Math.floor(value) });
        }} /></label>)}
    </section>
  );
}
