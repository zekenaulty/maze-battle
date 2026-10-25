import { useState } from 'react';
import type { ActorState, SkillId } from '../domain/types';
import { canUseSkill, getActorGcdRemaining, getAvailableCharges, getSkillCooldownRemaining, getSkillRechargeRemaining } from '../domain/combat/combatant';
import { xpForNextLevel } from '../domain/combat/rewards';
import { SKILLS } from '../domain/combat/skillCatalog';
import { VitalBar } from './VitalBar';
import './screens/battle.css';

interface BattleActionsProps {
  party: ActorState[];
  active: boolean;
  now: number;
  onSkill: (actorId: string, skillId: SkillId) => void;
  onAutoBattleChange: (actorId: string, enabled: boolean) => void;
  skillsVisible?: boolean;
  controlsDisabled?: boolean;
}

export function BattleActions({ party, active, now, onSkill, onAutoBattleChange, skillsVisible = true, controlsDisabled = false }: BattleActionsProps) {
  const [selectedId, setSelectedId] = useState(party[0]?.id);
  const selected = party.find((actor) => actor.id === selectedId) ?? party[0];
  return (
    <div className={`battle-action-panel ${skillsVisible ? '' : 'vitals-only'}`}>
      <nav className="battle-member-selector" aria-label="Battle party members">
        {party.map((actor) => <button type="button" key={actor.id} aria-pressed={actor.id === selected?.id}
          className={actor.id === selected?.id ? 'is-active' : ''} onClick={() => setSelectedId(actor.id)}>
          <strong>{actor.displayName}</strong><small>{actor.hp > 0 ? `HP ${actor.hp}/${actor.maxHp}` : 'Defeated'}</small>
        </button>)}
      </nav>
      <div className="battle-actions">
      {party.map((actor) => (
        <article className={`battle-character ${actor.id === selected?.id ? 'is-selected-member' : ''}`} aria-label={actor.displayName} key={actor.id}>
          <header>
            <div className="battle-character-title">
              <strong>{actor.displayName}</strong>
              <span>
                Level {actor.level} - XP {actor.xp}/{xpForNextLevel(actor.level)}
              </span>
            </div>
            <label className="compact-toggle auto-toggle">
              <input disabled={controlsDisabled} type="checkbox" aria-label={`${actor.displayName} auto battle`} checked={actor.autoBattle} onChange={(event) => onAutoBattleChange(actor.id, event.currentTarget.checked)} />
              <span>Auto</span>
            </label>
          </header>
          <div className="battle-character-vitals">
            <VitalBar label="HP" value={actor.hp} max={actor.maxHp} tone="health" />
            <VitalBar label="MP" value={actor.mp} max={actor.maxMp} tone="mana" />
          </div>
          {skillsVisible && <div className="battle-character-skills">
            {(actor.skills ?? []).map((skill) => {
              const cooldown = Math.max(getActorGcdRemaining(actor, now), getSkillCooldownRemaining(skill, now));
              const charges = getAvailableCharges(skill, now);
              const recharge = getSkillRechargeRemaining(skill, now);
              const definition = SKILLS[skill.id];
              const skillName = definition.name;
              const skillMeta = [
                !active ? 'Ended' : actor.hp <= 0 ? 'Defeated' : actor.mp < definition.mpCost ? `Need ${definition.mpCost} MP` : cooldown > 0 ? formatMs(cooldown) : `${definition.mpCost} MP`,
                charges !== undefined ? `${charges}/${skill.maxCharges ?? charges}` : '',
                cooldown < 1 && charges !== undefined && charges < (skill.maxCharges ?? charges) && recharge > 0 ? `+${formatMs(recharge)}` : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={skill.id}
                  type="button"
                  aria-label={skillName}
                  title={skillMeta ? `${skillName} ${skillMeta}` : skillName}
                  disabled={controlsDisabled || !active || !canUseSkill(actor, skill.id, now)}
                  onClick={() => onSkill(actor.id, skill.id)}
                >
                  <span className="skill-button-name">{skillName}</span>
                  <span className="skill-button-meta">{skillMeta}</span>
                </button>
              );
            })}
          </div>}
        </article>
      ))}
      </div>
    </div>
  );
}

function formatMs(milliseconds: number) {
  return `${Math.ceil(milliseconds / 100) / 10}s`;
}
