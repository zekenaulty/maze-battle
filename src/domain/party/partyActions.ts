import type { GameState, SkillId } from '../types';
import { applySkill } from '../combat/applySkill';
import { createCombatContext } from '../combat/battleContext';
import { canUseSkill } from '../combat/combatant';
import { defaultRng, type Rng } from '../combat/rng';
import { getEffectiveActor } from '../items/inventory';
import { createMazePathSearch } from '../maze/solver';
import { samePosition } from '../maze/key';
import { revealMazeVisibility } from '../maze/visibility';
import { updateQuestProgress } from '../quests/quests';

export type SpendableAttribute = 'strength' | 'vitality' | 'intellect';
const CAMP_SKILLS: SkillId[] = ['heal', 'groupHeal', 'resurrect', 'teleport'];

export function spendAttribute(game: GameState, actorId: string, attribute: SpendableAttribute): GameState {
  const actor = game.party.find(a => a.id === actorId);
  if (!actor || actor.attributes.available < 1 || !['strength', 'vitality', 'intellect'].includes(attribute)) return game;
  return {
    ...game,
    party: game.party.map(a => a.id !== actorId ? a : {
      ...a, attributes: { ...a.attributes, available: a.attributes.available - 1, [attribute]: a.attributes[attribute] + 1 },
      maxHp: a.maxHp + (attribute === 'vitality' ? 2 : 0), maxMp: a.maxMp + (attribute === 'intellect' ? 2 : 0),
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function setAutoSpendPoints(game: GameState, actorId: string, enabled: boolean): GameState {
  return { ...game, party: game.party.map(a => a.id === actorId ? { ...a, autoSpendPoints: enabled } : a), updatedAt: new Date().toISOString() };
}

export function castExplorationSkill(game: GameState, actorId: string, skillId: SkillId, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (game.battle || !CAMP_SKILLS.includes(skillId)) return game;
  const original = game.party.find(a => a.id === actorId);
  if (!original || !canUseSkill(original, skillId, now)) return game;
  if (skillId === 'resurrect' && game.party.every(a => a.hp > 0)) return game;
  if ((skillId === 'heal' || skillId === 'groupHeal') && !game.party.some(a => a.hp > 0 && a.hp < getEffectiveActor(a, game.inventory).maxHp)) return game;
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
