import { useEffect, useState } from 'react';
import type { ActorState, InventoryState } from '../../domain/types';
import { projectSkill, seconds } from '../../viewModels/characterSkills';

export function CharacterSkills({ actor, inventory }: { actor: ActorState; inventory: InventoryState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="character-skill-list">
    {(actor.skills ?? []).map((state) => {
      const skill = projectSkill(actor, inventory, state, now);
      if (!skill) return <article className="character-skill" key={state.id}><h4>{state.id}</h4><p>Skill definition unavailable.</p></article>;
      return <article className="character-skill" key={skill.id}>
        <div className="character-section-heading"><h4>{skill.name}</h4><span className={skill.status === 'Ready' ? 'stat-positive' : ''}>{skill.status}</span></div>
        <p>{skill.effect}</p>
        <dl>
          <div><dt>Cost</dt><dd>{skill.mpCost} MP</dd></div>
          <div><dt>Cooldown</dt><dd>{skill.cooldownMs / 1000}s</dd></div>
          {skill.charges !== undefined && <div><dt>Charges</dt><dd>{skill.charges}/{skill.maxCharges}</dd></div>}
          {skill.rechargeMs && <div><dt>Recharge</dt><dd>{skill.rechargeMs / 1000}s{skill.rechargeRemainingMs > 0 ? ` (${seconds(skill.rechargeRemainingMs)}s left)` : ''}</dd></div>}
        </dl>
      </article>;
    })}
    {(actor.skills ?? []).length === 0 && <p className="empty-state">No learned skills.</p>}
  </div>;
}
