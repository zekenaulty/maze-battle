import { travelCareChoices } from '../../../domain/automation/autoPolicy';
import { packSlotUsage } from '../../../domain/items/packCapacity';
import { executeCanonical, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, request as validateRequest } from '../validation';
import { fields, natural } from '../roster/codec';
import { gameCheckpoint, checkpointJson, rosterContext } from '../game/checkpoint';
import { loadRoster } from '../roster/projection';
import { commitRosterCommand } from '../game/rosterCommand';
import { commitContentCommand } from '../game/contentCommand';
import { commitExplorationCommand } from '../game/explorationCommand';
import { commitFloorPreparation } from '../game/preparation';
import { loadObservation, validateKnowledge } from '../knowledge/evidence';
import { readKnowledgeRoom } from '../knowledge/roomView';
import { same } from '../world/records';
import { autoEnabled, readAutoGuild } from './source';
import { initialAutoState, loadAutoRoom, loadAutoState, saveAutoState } from './records';
import { currentAutoRoom, recordAutoCrossing } from './waypoints';
import { observedDescent, planAutoRoute, retainObjective } from './planner';
import { AutoBlocked, type AutoState } from './types';

export function executeAutoCommand(request: CanonicalRequest) {
  request = validateRequest(request); check(request.operation === 'auto.command', 'invalid Auto operation');
  return executeCanonical(request, tx => commitAutoCommand(tx, request.input, request.attemptId), { limits: { reads: 16384, writes: 1024, bytes: 16 * 1024 * 1024 } });
}

/** One policy-selected shared action and its progress commit together. No caller-supplied route or effects. */
export async function commitAutoCommand(tx: CanonicalWork, input: unknown, attemptId: string) {
  const command = fields(input, 'kind revision'); natural(command.revision);
  check(command.kind === 'tick', 'invalid Auto command');
  let checkpoint = gameCheckpoint(tx.head.checkpoint);
  if (!autoEnabled(checkpoint)) return { kind: 'tick', outcome: 'paused', rosterChanged: false, needsFloor: null };
  if (command.revision !== tx.head.revision) return { kind: 'tick', outcome: 'stale', rosterChanged: false, needsFloor: null };
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const saved = await loadAutoState(tx.pages);
  let state: AutoState = saved?.level === checkpoint.position.level ? saved : initialAutoState(checkpoint, tx.head.revision);
  if (!same(state.lastPosition, checkpoint.position) || state.lastRevision !== tx.head.revision) {
    state.route = null; state.search = null;
    if (state.rootId !== checkpoint.position.cell.spaceId && !await loadAutoRoom(tx.pages, state, checkpoint.position.cell.spaceId)) state = initialAutoState(checkpoint, tx.head.revision);
  }
  state.lastPosition = checkpoint.position;
  const owned: CanonicalWork = { ...tx, setCheckpoint: value => { checkpoint = gameCheckpoint(value); tx.setCheckpoint(value); } };
  const finish = async (action: JsonObject | null, outcome = 'applied', reason = state.reason) => {
    if (checkpoint.position.level !== state.level) state = initialAutoState(checkpoint, tx.head.revision);
    state.lastRevision = tx.head.revision + 1; state.lastPosition = checkpoint.position; state.reason = reason;
    await saveAutoState(tx.pages, state);
    return { kind: 'tick', outcome, reason, action, rosterChanged: action?.channel === 'roster' || action?.channel === 'content', needsFloor: action?.needsFloor ?? null };
  };
  const act = async (channel: 'roster' | 'content' | 'exploration', payload: JsonObject): Promise<JsonObject> => {
    const result = channel === 'roster' ? await commitRosterCommand(owned, payload) : channel === 'content'
      ? await commitContentCommand(owned, payload) : await commitExplorationCommand(owned, payload);
    check(result && typeof result === 'object' && !Array.isArray(result), 'invalid Auto action result');
    return { ...result, channel };
  };
  try {
    state.status = checkpoint.mode === 'town' ? 'town' : 'running';
    const roster = (await loadRoster(tx.pages, rosterContext(checkpoint))).state;
    if (checkpoint.mode === 'town') {
      state.route = null;
      if (!state.townServiced) { const result = await act('roster', { kind: 'maintain-town' }); state.townServiced = true; return finish(result, 'applied', 'Rested and managed supplies.'); }
      if (packSlotUsage(roster) >= roster.inventory.capacity) throw new AutoBlocked('Pack is full after town care; sell, stash or unlock items.');
    } else {
      state.townServiced = false;
      for (const choice of travelCareChoices(roster)) {
        if (choice.kind === 'block') throw new AutoBlocked(choice.reason);
        const result = await act('roster', choice.kind === 'portal' ? { kind: 'portal' } : choice);
        if (result.outcome === 'applied') { if (choice.kind === 'portal') state.route = null; return finish(result, 'applied', 'Party care before travel.'); }
      }
    }
    const guild = await readAutoGuild(tx.pages, checkpoint);
    if (guild.completed.length) return finish(await act('content', { kind: 'claim-quest', questId: guild.completed[0].id }), 'applied', 'Claimed completed guild work.');
    const offer = guild.offers.filter(c => c.objective !== 'kill').sort((a, b) => a.id.localeCompare(b.id))[0];
    if (offer) return finish(await act('content', { kind: 'accept-quest', contractId: offer.id }), 'applied', 'Accepted a noncombat guild contract.');
    if (checkpoint.mode === 'town') return finish(await act('roster', { kind: 'leave-town' }), 'applied', 'Supplies ready; returning to expedition.');
    check(checkpoint.knowledge, 'Auto requires earned starting sight');
    const sight = await loadObservation(tx.pages, { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id });
    check(same(sight.header.actor, checkpoint.position), 'Auto position differs from sight');
    const here = sight.cells.find(c => same(c.at, checkpoint.position))!;
    const chest = here.chests.find(c => !c.opened);
    if (chest) return finish(await act('content', { kind: 'open-chest', chestId: chest.id }), 'applied', 'Explicitly collected a chest on route.');
    retainObjective(state, guild);
    const room = await currentAutoRoom(tx.pages, state);
    if (state.objective?.kind === 'exit' && state.completed && same(state.descent, checkpoint.position)) {
      check(here.stairs.includes('down') && guild.active.length === 0 && !guild.combatRequired, 'Auto descent has unfinished work');
      const preparation = await commitFloorPreparation(owned, { level: checkpoint.position.level + 1 }, attemptId);
      if (preparation.phase !== 'ready') return finish({ ...preparation, kind: 'prepare-floor', channel: 'preparation' }, 'planning',
        `Preparing dungeon ${checkpoint.position.level + 1}: ${preparation.phase}`);
      state.route = null; return finish(await act('exploration', { kind: 'stairs', direction: 'down' }), 'applied', 'Explicit descent after completed work.');
    }
    if (!state.route) {
      const view = await readKnowledgeRoom(tx.pages, checkpoint);
      state.descent ??= observedDescent(view.cells) ?? null;
      await planAutoRoute(tx.pages, checkpoint, state, room, view, guild);
    }
    const step = state.route?.steps[0];
    if (!step) return finish(null, 'planning');
    check(same(step.from, checkpoint.position), 'Auto route origin changed');
    if (!same(here.edges[step.direction] ?? null, step.to)) throw new AutoBlocked('Cached route no longer matches earned current sight.');
    const result = await act('exploration', { kind: 'move', direction: step.direction, triggerStairs: false });
    if (!same(checkpoint.position, step.to) || result.moved !== true) throw new AutoBlocked('Auto move made no confirmed spatial progress.');
    if (step.from.cell.spaceId !== step.to.cell.spaceId) {
      const after = await loadObservation(tx.pages, { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id });
      await recordAutoCrossing(tx.pages, state, room, step, after.cells);
    }
    state.route!.steps.shift(); if (!state.route!.steps.length) state.route = null;
    return finish(result, 'applied', 'Following an earned waypoint route.');
  } catch (error) {
    if (!(error instanceof AutoBlocked)) throw error;
    state.status = 'blocked'; state.route = null; state.search = null;
    checkpoint = { ...checkpoint, ...(checkpoint.mode === 'town' ? { townReturnMode: 'manual' as const } : { mode: 'manual' as const }),
      activityLog: [`Auto stopped: ${error.message}`, ...checkpoint.activityLog].slice(0, 12) };
    tx.setCheckpoint(checkpointJson(checkpoint));
    return finish(null, 'blocked', error.message);
  }
}
