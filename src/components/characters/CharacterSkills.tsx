import { useEffect, useState } from 'react';
import { WandSparkles } from 'lucide-react';
import type { ActorState, InventoryState, SkillId } from '../../domain/types';
import { explorationCastReason, isExplorationSkill, projectSkill, seconds } from '../../viewModels/characterSkills';

interface CharacterSkillsProps {
  actor: ActorState;
  party: ActorState[];
  inventory: InventoryState;
  onCastSkill?: (actorId: string, skillId: SkillId) => void;
  allowOutOfCombatSkills?: boolean;
  allowTeleport?: boolean;
  now?: number;
}

export function CharacterSkills({ actor, party, inventory, onCastSkill, allowOutOfCombatSkills = false, allowTeleport, now }: CharacterSkillsProps) {
  const [liveNow, setLiveNow] = useState(Date.now);
  useEffect(() => {
    if (now !== undefined) return;
    setLiveNow(Date.now());
    const timer = window.setInterval(() => setLiveNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [now]);
  const castContext = { party, now: now ?? liveNow, allowed: allowOutOfCombatSkills, allowTeleport, hasHandler: Boolean(onCastSkill) };
  return <div className="character-skill-list">
    {(actor.skills ?? []).map((state) => {
      const skill = projectSkill(actor, inventory, state, castContext.now);
      if (!skill) return <article className="character-skill" key={state.id}><h4>{state.id}</h4><p>Skill definition unavailable.</p></article>;
      const castable = isExplorationSkill(skill.id);
      const reason = castable ? explorationCastReason(actor, inventory, state, castContext) : undefined;
      const status = reason ?? skill.status;
      const statusId = `character-skill-status-${actor.id}-${skill.id}`;
      return <article className="character-skill" key={skill.id}>
        <div className="character-section-heading"><h4>{skill.name}</h4><span id={statusId} className={status === 'Ready' ? 'stat-positive' : ''}>{status}</span></div>
        <p>{skill.effect}</p>
        <div className="character-skill-footer">
          <dl>
            <div><dt>Cost</dt><dd>{skill.mpCost} MP</dd></div>
            <div><dt>Cooldown</dt><dd>{skill.cooldownMs / 1000}s</dd></div>
            {skill.charges !== undefined && <div><dt>Charges</dt><dd>{skill.charges}/{skill.maxCharges}</dd></div>}
            {skill.rechargeMs && <div><dt>Recharge</dt><dd>{skill.rechargeMs / 1000}s{skill.rechargeRemainingMs > 0 ? ` (${seconds(skill.rechargeRemainingMs)}s left)` : ''}</dd></div>}
          </dl>
          {castable && <button type="button" aria-label={`Cast ${skill.name}`} aria-describedby={statusId} disabled={Boolean(reason)} title={reason ?? `Cast ${skill.name}`} onClick={() => {
              const current = { ...castContext, now: now ?? Date.now() };
              if (!explorationCastReason(actor, inventory, state, current)) onCastSkill?.(actor.id, skill.id);
            }}><WandSparkles aria-hidden="true" />Cast</button>}
        </div>
      </article>;
    })}
    {(actor.skills ?? []).length === 0 && <p className="empty-state">No learned skills.</p>}
  </div>;
}
