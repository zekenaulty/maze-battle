import type { HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';
import { requireRpg, rpgShape } from '../../services/agentica/rpg/validation';
import type { GameWrite } from '../gameTransaction';
import { boundedJson } from '../agenticaValidation';
import { currentGame } from '../rpgTravel/execute';
import { sameTravelPosition, validateTravel } from '../rpgTravel/validation';
import { sameOwner, type SaveControl } from '../saveControl';
import { rpgOperationAt } from './records';
import { checkHost, rpgAgenticaWrite, sealHost } from './transaction';
import { rpgCancelledObservation, rpgOperationObservation, rpgTravelUsage } from './evidence';

export const rpgEventKey = (id: string, sequence: number) => JSON.stringify([id, sequence]);
const terminal = (event?: HostOperationEvent) => event && ['decision', 'completed', 'cancelled', 'blocked'].includes(event.kind);

export async function rpgEventAt(tx: GameWrite, id: string, sequence: number) {
  const key = rpgEventKey(id, sequence), stored = await tx.objectStore('rpgAgenticaEvents').get(key);
  requireRpg(stored, 'missing retained event'); checkHost(stored);
  requireRpg(rpgShape(stored, 'key,event,witness') && stored.key === key, 'invalid event record');
  const link = await rpgOperationAt(tx, id), event = stored.event;
  requireRpg(event.operationId === id && event.sequence === sequence && event.hostId === 'maze-battle'
    && event.sessionId === link.binding.sessionId && event.actionId === link.action.actionId
    && event.observation.data.scopeId === link.binding.scopeId && event.observation.data.gameId === link.binding.gameId,
    'event lineage changed');
  requireRpg(event.kind === 'completed' ? event.completion?.objectiveId === link.binding.objectiveId : !event.completion,
    'event completion changed');
  return event;
}

/** Never replace a possibly delivered event with a newer world observation. */
export async function stageRpgEventAt(tx: GameWrite, id: string, expected: SaveControl, transfer = false): Promise<HostOperationEvent> {
  const link = await rpgOperationAt(tx, id);
  if (link.sequence !== link.acknowledged) {
    requireRpg(!transfer, 'acknowledge original before transfer');
    return rpgEventAt(tx, id, link.sequence);
  }
  const previous = link.sequence ? await rpgEventAt(tx, id, link.sequence) : undefined;
  requireRpg(!terminal(previous), 'operation already terminal or handed off');
  const current = await currentGame(tx), stored = await tx.objectStore('rpgTravels').get(id);
  requireRpg(current && stored && current.game.id === link.binding.gameId && sameOwner(current.control, expected)
    && current.control.revision === expected.revision, 'event custody changed');
  const travel = validateTravel(stored, id), op = travel.operation;
  requireRpg(op.status === 'cancelled' || sameOwner(travel.control, current.control)
    && travel.control.revision === current.control.revision, 'journey requires adoption');
  const slot = await tx.objectStore('saves').get('auto'); requireRpg(slot, 'game missing');
  const position = { floor: current.game.dungeonLevel, ...current.game.maze.active };
  requireRpg(op.status === 'cancelled' || travel.sourceHead === slot.observationHead && sameTravelPosition(travel.position, position), 'journey position changed');
  if (transfer) requireRpg(String(current.control.epoch) !== link.activeEpoch && op.status === 'running', 'transfer needs explicitly adopted new epoch');
  else if (op.status !== 'cancelled') requireRpg(String(current.control.epoch) === link.activeEpoch, 'new custody requires transfer');
  const kind = transfer ? 'transfer' : travel.exploration?.decision ? 'decision' : op.status === 'arrived'
    ? !travel.frontier && link.binding.mode !== 'exploration' && sameTravelPosition(position, link.binding.completionTarget) ? 'completed' : 'decision'
    : op.status === 'interrupted' ? 'blocked' : op.status === 'cancelled' ? 'cancelled' : 'progress';
  const summary = kind === 'completed' ? 'Reached the host-bound known destination. No interaction performed.'
    : kind === 'decision' ? travel.exploration?.decision ? op.reason
      : travel.frontier ? 'Reached the selected frontier. Review newly earned evidence before choosing another intention.'
      : 'Reached the chosen destination. The governing objective is not complete.'
    : kind === 'transfer' ? 'Explicitly adopted the original journey; target, limits, elapsed time and usage retained.'
    : kind === 'progress' ? 'Routine browser-owned travel progress; no cognition requested.' : op.reason;
  const observation = op.status === 'cancelled' ? await rpgCancelledObservation(tx, travel, link.binding)
    : await rpgOperationObservation(tx, slot, current.control.revision, link.binding, !!travel.frontier && kind === 'decision');
  if (kind === 'decision' && travel.exploration?.decision) observation.data.notice = structuredClone(travel.exploration.decision);
  const event: HostOperationEvent = { hostId: 'maze-battle', sessionId: link.binding.sessionId, sessionEpoch: link.activeEpoch,
    actionId: link.action.actionId, operationId: id, sequence: link.sequence + 1, eventId: crypto.randomUUID(), kind,
    observation, summary, usage: rpgTravelUsage(travel),
    ...(kind === 'completed' ? { completion: { objectiveId: link.binding.objectiveId, evidenceId: crypto.randomUUID(), summary } } : {}),
    ...(transfer ? { nextSessionEpoch: String(current.control.epoch) } : {}) };
  requireRpg(Number.isSafeInteger(event.sequence), 'event sequence exhausted'); boundedJson(event);
  await tx.objectStore('rpgAgenticaEvents').add(sealHost({ key: rpgEventKey(id, event.sequence), event }));
  const { witness: _witness, ...body } = link;
  await tx.objectStore('rpgAgenticaOperations').put(sealHost({ ...body, sequence: event.sequence,
    activeEpoch: event.nextSessionEpoch ?? link.activeEpoch }));
  return event;
}

export function stageRpgHostEvent(id: string, control: SaveControl) {
  const expected = structuredClone(control);
  return rpgAgenticaWrite(tx => stageRpgEventAt(tx, id, expected));
}
export function readRpgHostOperation(id: string) {
  return rpgAgenticaWrite(async tx => { const link = await rpgOperationAt(tx, id);
    return { link, event: link.sequence ? await rpgEventAt(tx, id, link.sequence) : undefined }; });
}
export function acknowledgeRpgHostEvent(event: HostOperationEvent) {
  const input: HostOperationEvent = JSON.parse(boundedJson(event));
  return rpgAgenticaWrite(async tx => {
    const link = await rpgOperationAt(tx, input.operationId), original = await rpgEventAt(tx, input.operationId, input.sequence);
    requireRpg(link.sequence === input.sequence && boundedJson(input) === boundedJson(original), 'event acknowledgement changed');
    const { witness: _witness, ...body } = link;
    await tx.objectStore('rpgAgenticaOperations').put(sealHost({ ...body, acknowledged: input.sequence }));
  });
}
