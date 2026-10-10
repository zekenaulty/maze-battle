import { Plus } from 'lucide-react';
import type { ActorState, InventoryState } from '../../domain/types';
import { projectCharacter, signed, type SpendableAttribute } from '../../viewModels/characterSheet';

export function CharacterStats({ actor, inventory, onSpendAttribute, onAutoSpendChange }: {
  actor: ActorState; inventory: InventoryState; onSpendAttribute?: (actorId: string, attribute: SpendableAttribute) => void;
  onAutoSpendChange?: (actorId: string, enabled: boolean) => void;
}) {
  const sheet = projectCharacter(actor, inventory);
  return (
    <div className="character-stats">
      <div className="character-section-heading"><h4>Attributes</h4><span>Available points <strong>{actor.attributes.available}</strong></span></div>
      {onAutoSpendChange && <label className="character-auto-spend">
        <input type="checkbox" checked={(actor as ActorState & { autoSpendPoints?: boolean }).autoSpendPoints !== false} onChange={(event) => onAutoSpendChange(actor.id, event.currentTarget.checked)} />
        <span>Auto-spend points</span>
      </label>}
      <table aria-label={`${actor.displayName} base and effective stats`}>
        <thead><tr><th scope="col">Stat</th><th scope="col">Base</th><th scope="col">Gear</th><th scope="col">Effective</th><th scope="col"><span className="character-sr-only">Spend point</span></th></tr></thead>
        <tbody>{sheet.stats.map(({ key, label, base, gear, effective }) => {
          const spendable = key === 'strength' || key === 'vitality' || key === 'intellect';
          const disabled = !onSpendAttribute || actor.attributes.available < 1;
          return <tr key={key}><th scope="row">{label}</th><td>{base}</td><td className={gear > 0 ? 'stat-positive' : gear < 0 ? 'stat-negative' : ''}>{signed(gear)}</td><td><strong>{effective}</strong></td><td>{spendable && onSpendAttribute && <button className="character-icon-button" type="button" aria-label={`Increase ${label}`} title={disabled ? 'No available points' : `Spend 1 point on ${label}`} disabled={disabled} onClick={() => onSpendAttribute(actor.id, key)}><Plus aria-hidden="true" /></button>}</td></tr>;
        })}</tbody>
      </table>
      <dl className="character-combat-stats">
        <div><dt>Attack damage</dt><dd>{sheet.effectiveDamage.min}-{sheet.effectiveDamage.max} <small>(base {sheet.baseDamage.min}-{sheet.baseDamage.max})</small></dd></div>
        <div><dt>Damage scaling</dt><dd>{actor.combat.scaleWith}</dd></div>
      </dl>
    </div>
  );
}
