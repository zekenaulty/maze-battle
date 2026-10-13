import type { GameState, SkillId } from '../types';
import { applySkill } from '../combat/applySkill';
import { createCombatContext } from '../combat/battleContext';
import { canUseSkill } from '../combat/combatant';
import { defaultRng, type Rng } from '../combat/rng';
import { createMazePathSearch } from '../maze/solver';
import { samePosition } from '../maze/key';
import { revealMazeVisibility } from '../maze/visibility';
import { updateQuestProgress } from '../quests/quests';
import { castCampSkill } from './campSkills';

export { spendAttribute, setAutoSpendPoints, setActorAutoBattle, type SpendableAttribute } from './partyRules';
export { castCampSkill, type CampSkill } from './campSkills';

export function castExplorationSkill(game: GameState, actorId: string, skillId: SkillId, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (skillId === 'heal' || skillId === 'groupHeal' || skillId === 'resurrect') return castCampSkill(game, actorId, skillId, rng, now);
  if (game.battle || skillId !== 'teleport') return game;
  const original = game.party.find(a => a.id === actorId);
  if (!original || !canUseSkill(original, skillId, now)) return game;
  const destinations = skillId === 'teleport' ? teleportDestinations(game) : [];
  if (skillId === 'teleport' && (game.mode === 'town' || !destinations.length)) return game;
  const context = createCombatContext(game, rng, now);
  const actor = context.party.find(a => a.id === actorId)!;
  if (!applySkill(actor, skillId, context)) return game;
  let next: GameState = { ...game, party: context.party, updatedAt: new Date(now).toISOString(), activityLog: [...context.log.reverse(), ...game.activityLog].slice(0, 20) };
  if (skillId === 'teleport') {
    const destination = destinations[Math.min(destinations.length - 1, Math.floor(rng() * destinations.length))];
    const active = { row: destination.row, column: destination.column };
    const visited = game.maze.visited.some(p => samePosition(p, active)) ? game.maze.visited : [...game.maze.visited, active];
    const maze = revealMazeVisibility({ ...game.maze, active, visited });
    next = {
      ...next, maze, autopilot: undefined,
      floors: next.floors.map(f => f.level === next.dungeonLevel ? { ...f, maze } : f),
      activityLog: [`${actor.displayName} teleported.`, ...next.activityLog].slice(0, 20),
    };
    next = updateQuestProgress(next);
  }
  return next;
}

function teleportDestinations(game: GameState) {
  const search = createMazePathSearch(game.maze);
  return game.maze.cells.filter(cell => cell.links.length && !samePosition(cell, game.maze.active)
    && !samePosition(cell, game.maze.start) && !samePosition(cell, game.maze.end) && Number.isFinite(search.distanceTo(cell)));
}
