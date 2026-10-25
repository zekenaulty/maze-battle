import type { Direction } from '../../../domain/types';
import { fields } from '../roster/codec';
import { loadParty } from '../roster/projection';
import { check, request as validateRequest } from '../validation';
import { executeCanonical, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { json, loadFloor, same } from '../world/records';
import { resolveFloorTravel, resolveWorldStep } from '../world/residency';
import { requireWorldContent } from '../content/preparation';
import { recordRoomQuestVisit } from '../content/questActions';
import { recordGameObservation, type ObservationReview } from '../knowledge/write';
import { validateKnowledge } from '../knowledge/evidence';
import { DIRECTIONS } from '../knowledge/types';
import { checkpointJson, gameCheckpoint, type GameCheckpoint } from './checkpoint';
import { findPreparation } from './preparation';
import { currentBattle } from '../combat/coherence';
import { movementEncounter } from '../combat/encounter';

export type ExplorationCommand = { kind: 'look' } | { kind: 'move'; direction: Direction; triggerStairs: boolean }
  | { kind: 'stairs'; direction: 'up' | 'down' };
export function explorationCommand(input: unknown): ExplorationCommand {
  const c = fields(input, 'kind', 'direction triggerStairs');
  if (c.kind === 'look') check(Object.keys(c).length === 1, 'invalid look command');
  else if (c.kind === 'move') check(Object.keys(c).length === 3 && DIRECTIONS.includes(c.direction as Direction)
    && typeof c.triggerStairs === 'boolean', 'invalid movement command');
  else check(c.kind === 'stairs' && Object.keys(c).length === 2 && ['up', 'down'].includes(c.direction as string), 'invalid stair command');
  return input as ExplorationCommand;
}
export function executeExplorationCommand(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  request = validateRequest(request); check(request.operation === 'exploration.command', 'invalid exploration operation');
  return executeCanonical(request, tx => commitExplorationCommand(tx, request.input), options);
}

/** Noncombat game commands. Controller choice cannot change movement's interaction policy. */
export async function commitExplorationCommand(tx: CanonicalWork, input: unknown, review?: ObservationReview) {
  const command = explorationCommand(input), before = gameCheckpoint(tx.head.checkpoint);
  const prior = await validateKnowledge(tx.pages, before.knowledge);
  const battle = await currentBattle(tx.pages, before);
  if (battle || before.mode === 'town' || !(await loadParty(tx.pages)).some(actor => actor.hp > 0)) return { kind: command.kind, outcome: 'unavailable' };
  await requireWorldContent(tx.pages, before.position.level);
  if (command.kind !== 'look') {
    check(before.knowledge, 'observe the starting position before movement');
    check(prior && same(prior.header.actor, before.position), 'checkpoint position differs from its observation');
  }
  const now = new Date().toISOString();
  let next: GameCheckpoint = { ...before, updatedAt: now }, moved = false, crossed = false, needsFloor: number | null = null;
  let stair: 'up' | 'down' | null = command.kind === 'stairs' ? command.direction : null;
  if (command.kind === 'move') {
    const step = await resolveWorldStep(tx.pages, before.position, command.direction);
    moved = step.moved; crossed = step.crossed; next = { ...next, position: step.position, facing: command.direction };
    if (moved && command.triggerStairs) {
      const floor = await loadFloor(tx.pages, next.position.level);
      stair = same(next.position.cell, floor.entry) ? 'up' : same(next.position.cell, floor.exit) ? 'down' : null;
    }
  }
  if (stair) {
    const phase = stair === 'down' ? await findPreparation(tx.pages, next.position.level + 1) : null;
    const floor = await loadFloor(tx.pages, next.position.level);
    check(same(next.position.cell, stair === 'up' ? floor.entry : floor.exit), 'actor is not on these stairs');
    const travel = phase && phase !== 'ready' ? { kind: 'prepare' as const, level: next.position.level + 1 }
      : await resolveFloorTravel(tx.pages, next.position, stair);
    if (travel.kind === 'prepare') needsFloor = travel.level;
    else if (travel.kind === 'town') next = { ...next, mode: 'town', townReturnMode: before.mode as 'manual' | 'auto-play' | 'waves' };
    else {
      await requireWorldContent(tx.pages, travel.position.level);
      next = { ...next, position: travel.position }; moved = true; crossed = true;
    }
  }
  if (moved && next.mode !== 'town') {
    const visit = await recordRoomQuestVisit(tx.pages, next.position, now);
    if (visit) next = { ...next, activityLog: [`Quest complete: ${visit.quest.title}.`, ...next.activityLog].slice(0, 12) };
  }
  if (next.mode !== 'town') next = await recordGameObservation(tx, next, review);
  if (moved && command.kind === 'move' && !stair && next.mode !== 'town') next = await movementEncounter(tx, next);
  tx.setCheckpoint(checkpointJson(next));
  return json({ kind: command.kind, outcome: 'applied', moved, crossed, needsFloor, mode: next.mode,
    position: next.position, observation: next.knowledge ? { sequence: next.knowledge.sequence, id: next.knowledge.id } : null });
}
