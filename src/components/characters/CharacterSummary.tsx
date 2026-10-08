import type { ActorState, InventoryState } from '../../domain/types';
import { projectCharacter } from '../../viewModels/characterSheet';

export function CharacterSummary({ actor, inventory, onAutoBattleChange }: {
  actor: ActorState; inventory: InventoryState; onAutoBattleChange: (actorId: string, enabled: boolean) => void;
}) {
  const sheet = projectCharacter(actor, inventory);
  return (
    <div className="character-summary">
      <header>
        <div className="character-card-title"><h3>{actor.displayName}</h3><span>Level {actor.level} {actor.role} - Gear {sheet.gearScore}</span></div>
        <label className="compact-toggle auto-toggle"><input type="checkbox" checked={actor.autoBattle} onChange={(event) => onAutoBattleChange(actor.id, event.currentTarget.checked)} /><span>Auto battle</span></label>
      </header>
      <div className="character-vitals">
        <Vital label="HP" value={sheet.effective.hp} max={sheet.effective.maxHp} />
        <Vital label="MP" value={sheet.effective.mp} max={sheet.effective.maxMp} />
        <div className="character-vital character-xp"><span>XP <strong>{actor.xp}/{sheet.xpRequired}</strong></span><progress aria-label={`${actor.displayName} XP`} max={100} value={sheet.xpPercent} /><small>{sheet.xpRemaining} to level {actor.level + 1}</small></div>
      </div>
    </div>
  );
}

function Vital({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className={`character-vital character-${label.toLowerCase()}`}><span>{label} <strong>{value}/{max}</strong></span><progress aria-label={label} max={Math.max(1, max)} value={Math.max(0, value)} /></div>;
}
