import type { BattleState, EnemyState, SkillId } from '../types';
import { chooseEnemySkill, chooseHeroSkill } from './ai';
import { applySkill } from './applySkill';
import { battleStatus, createBattleContext, removeDefeated, type BattleCombatContext, type BattleFrame } from './battleContext';
import type { Rng } from './rng';

export type BattleTurnCommand = { kind: 'round' } | { kind: 'skill'; actorId: string; skillId: SkillId };
export interface BattleTurnResult {
  context: BattleCombatContext;
  newlyDefeated: EnemyState[];
  status: BattleState['status'];
  acted: boolean;
}

/** One turn only. Idle active rounds and refused skills must not publish their refreshed context. */
export function executeBattleTurn(frame: BattleFrame, command: BattleTurnCommand, rng: Rng, now: number): BattleTurnResult {
  if (frame.battle.status !== 'active') throw new Error('Battle turn requires an active battle.');
  const context = createBattleContext(frame, rng, now);
  let acted = false;
  if (command.kind === 'skill') {
    const actor = context.party.find(item => item.id === command.actorId);
    if (!actor || !applySkill(actor, command.skillId, context))
      return { context, newlyDefeated: [], status: 'active', acted: false };
    acted = true;
    removeDefeated(context, rng);
    runEnemyTurn(context);
  } else {
    for (const actor of context.party) {
      const skill = chooseHeroSkill(actor, context.party, context.enemies, rng, now);
      if (skill) acted = applySkill(actor, skill, context) || acted;
      acted = removeDefeated(context, rng) || acted;
    }
    acted = runEnemyTurn(context) || acted;
  }
  const previous = new Set(frame.battle.defeated?.map(enemy => enemy.id) ?? []);
  return { context, newlyDefeated: context.defeated.filter(enemy => !previous.has(enemy.id)), status: battleStatus(context), acted };
}

function runEnemyTurn(context: BattleCombatContext) {
  let acted = false;
  for (const enemy of context.enemies) {
    const skill = chooseEnemySkill(enemy, context.rng, context.now);
    if (skill) acted = applySkill(enemy, skill, context) || acted;
  }
  return acted;
}
