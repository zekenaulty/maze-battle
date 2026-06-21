import type { ActorState, SkillId } from '../domain/types';
import { canUseSkill, getActorGcdRemaining, getAvailableCharges, getSkillCooldownRemaining, getSkillRechargeRemaining } from '../domain/combat/combatant';
import { xpForNextLevel } from '../domain/combat/rewards';
import { SKILLS } from '../domain/combat/skillCatalog';
import { VitalBar } from './VitalBar';

interface BattleActionsProps {
  party: ActorState[];
  active: boolean;
  now: number;
  onSkill: (actorId: string, skillId: SkillId) => void;
  onAutoBattleChange: (actorId: string, enabled: boolean) => void;
}

export function BattleActions({ party, active, now, onSkill, onAutoBattleChange }: BattleActionsProps) {
  return (
    <div className="battle-actions">
      {party.map((actor) => (
        <article className="battle-character" key={actor.id}>
          <header>
            <div className="battle-character-title">
              <strong>{actor.displayName}</strong>
              <span>
                Level {actor.level} - XP {actor.xp}/{xpForNextLevel(actor.level)}
              </span>
            </div>
            <label className="compact-toggle auto-toggle">
              <input type="checkbox" checked={actor.autoBattle} onChange={(event) => onAutoBattleChange(actor.id, event.currentTarget.checked)} />
              <span>Auto</span>
            </label>
          </header>
          <div className="battle-character-vitals">
            <VitalBar label="HP" value={actor.hp} max={actor.maxHp} tone="health" />
            <VitalBar label="MP" value={actor.mp} max={actor.maxMp} tone="mana" />
          </div>
          <div className="battle-character-skills">
            {(actor.skills ?? []).map((skill) => {
              const cooldown = Math.max(getActorGcdRemaining(actor, now), getSkillCooldownRemaining(skill, now));
              const charges = getAvailableCharges(skill, now);
              const recharge = getSkillRechargeRemaining(skill, now);
              const skillName = SKILLS[skill.id].name;
              const skillMeta = [
                cooldown > 0 ? formatMs(cooldown) : '',
                charges !== undefined ? `${charges}/${skill.maxCharges}` : '',
                cooldown < 1 && charges !== undefined && charges < (skill.maxCharges ?? charges) && recharge > 0 ? `+${formatMs(recharge)}` : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={skill.id}
                  type="button"
                  title={skillMeta ? `${skillName} ${skillMeta}` : skillName}
                  disabled={!active || !canUseSkill(actor, skill.id, now)}
                  onClick={() => onSkill(actor.id, skill.id)}
                >
                  <span className="skill-button-name">{skillName}</span>
                  <span className="skill-button-meta">{skillMeta}</span>
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatMs(milliseconds: number) {
  return `${Math.ceil(milliseconds / 100) / 10}s`;
}
